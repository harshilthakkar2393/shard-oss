// useFileUploader.ts - Updated to use S3 functions
import { useState, useCallback, useRef } from "react";
import {
  s3InitiateMultipartUpload,
  s3GenerateUploadPartUrl,
  s3CompleteMultipartUpload,
  s3ListUploadedParts,
  s3GetUploadUrl,
  s3AbortMultipartUpload,
} from "@/lib/s3"; // Updated import path

interface UploadState {
  progress: number;
  remainingTime: number | null;
  status: 'idle' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error: string | null;
  speed: number; // MB/s
}

interface UseFileUploaderOptions {
  maxConcurrent?: number;        // Max concurrent uploads (utilize full bandwidth)
  progressThrottleMs?: number;   // How often to update progress (reduce state changes)
  adaptiveChunking?: boolean;    // Automatically adjust chunk size based on speed
  onComplete?: (key: string) => void;
  onError?: (error: string) => void;
}

export const useFileUploader = ({
  maxConcurrent = 10,           // High concurrency for max speed
  progressThrottleMs = 500,     // Update progress every 500ms instead of constantly
  adaptiveChunking = true,      // Auto-adjust chunk size
  onComplete,
  onError,
}: UseFileUploaderOptions = {}) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    remainingTime: null,
    status: 'idle',
    error: null,
    speed: 0,
  });

  const uploadRef = useRef<{
    totalSize: number;
    uploadedBytes: number;
    startTime: number;
    lastProgressUpdate: number;
    uploadId?: string;
    key?: string;
    cancelled: boolean;
    chunkSize: number;
    speedSamples: { timestamp: number; bytes: number }[]; // Track bytes over time
    completedParts: Set<number>; // Track which parts are fully uploaded
    lastSpeedCalculation: number;
  }>({
    totalSize: 0,
    uploadedBytes: 0,
    startTime: 0,
    lastProgressUpdate: 0,
    cancelled: false,
    chunkSize: 8 * 1024 * 1024, // Start with 8MB chunks
    speedSamples: [],
    completedParts: new Set(),
    lastSpeedCalculation: 0,
  });

  // Throttled progress update - only update state occasionally
  const updateProgress = useCallback((forceUpdate = false) => {
    const now = Date.now();
    const ref = uploadRef.current;
    
    // Only update if enough time has passed or forced
    if (!forceUpdate && now - ref.lastProgressUpdate < progressThrottleMs) {
      return;
    }

    // Calculate progress based on completed parts, not in-progress bytes
    const progress = Math.min((ref.uploadedBytes / ref.totalSize) * 100, 99.9); // Cap at 99.9% until complete
    
    let remainingTime = null;
    let speed = 0;
    
    // Calculate speed based on total throughput - less aggressive filtering
    if (ref.speedSamples.length >= 2) {
      // Remove very old samples (older than 20 seconds) but keep recent ones
      const cutoffTime = now - 20000;
      const filteredSamples = ref.speedSamples.filter(sample => sample.timestamp > cutoffTime);
      
      if (filteredSamples.length >= 2) {
        // Use samples from at least 3 seconds ago to avoid rapid fluctuations
        const oldSample = filteredSamples.find(sample => now - sample.timestamp >= 3000) || filteredSamples[0];
        const newSample = filteredSamples[filteredSamples.length - 1];
        
        const timeDiff = (newSample.timestamp - oldSample.timestamp) / 1000; // seconds
        const bytesDiff = newSample.bytes - oldSample.bytes;
        
        if (timeDiff >= 1 && bytesDiff > 0) { // At least 1 second of data
          speed = (bytesDiff / (1024 * 1024)) / timeDiff; // MB/s
        }
        
        // Update the samples array less frequently
        ref.speedSamples = filteredSamples;
      }
    }
    
    // Calculate remaining time based on current speed - only if we have a stable speed
    if (speed > 0.1) { // Only calculate if speed is meaningful
      const remainingBytes = ref.totalSize - ref.uploadedBytes;
      if (remainingBytes > 0) {
        remainingTime = Math.max(0, Math.round(remainingBytes / (speed * 1024 * 1024)));
      }
    }

    setUploadState(prev => ({
      ...prev,
      progress,
      remainingTime,
      speed,
    }));

    ref.lastProgressUpdate = now;
  }, [progressThrottleMs]);

  // Calculate optimal chunk size based on network speed
  const calculateOptimalChunkSize = useCallback((currentSpeed: number) => {
    if (!adaptiveChunking) return uploadRef.current.chunkSize;

    // Adjust chunk size based on speed (faster = bigger chunks)
    if (currentSpeed > 50) {       // > 50 MB/s - use large chunks
      return 64 * 1024 * 1024;     // 64MB
    } else if (currentSpeed > 10) { // > 10 MB/s - use medium chunks  
      return 32 * 1024 * 1024;     // 32MB
    } else if (currentSpeed > 2) {  // > 2 MB/s - use small chunks
      return 16 * 1024 * 1024;     // 16MB
    } else {                       // Slow connection
      return 8 * 1024 * 1024;      // 8MB
    }
  }, [adaptiveChunking]);

  const cancelUpload = useCallback(async () => {
    uploadRef.current.cancelled = true;
    
    if (uploadRef.current.uploadId && uploadRef.current.key) {
      try {
        await s3AbortMultipartUpload(uploadRef.current.uploadId, uploadRef.current.key);
      } catch (error) {
        console.error("Failed to abort upload:", error);
      }
    }

    setUploadState(prev => ({
      ...prev,
      status: 'cancelled',
      error: 'Upload cancelled by user',
    }));
  }, []);

  const uploadFile = useCallback(async (key: string, file: File) => {
    try {
      // Reset state
      uploadRef.current = {
        totalSize: file.size,
        uploadedBytes: 0,
        startTime: Date.now(),
        lastProgressUpdate: 0,
        key,
        cancelled: false,
        chunkSize: 8 * 1024 * 1024, // Start with 8MB
        speedSamples: [],
        completedParts: new Set(),
        lastSpeedCalculation: 0,
      };

      setUploadState({
        progress: 0,
        remainingTime: null,
        status: 'uploading',
        error: null,
        speed: 0,
      });

      // Use multipart for any file > 5MB to maximize parallel uploads
      if (file.size <= 5 * 1024 * 1024) {
        await uploadFileAsSingle(key, file);
      } else {
        await uploadFileInChunks(key, file);
      }

      if (!uploadRef.current.cancelled) {
        setUploadState(prev => ({ ...prev, status: 'completed' }));
        onComplete?.(key);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      onError?.(errorMessage);
    }
  }, [onComplete, onError]);

  const uploadFileAsSingle = async (key: string, file: File) => {
    if (uploadRef.current.cancelled) return;

    const presignedUrl = await s3GetUploadUrl(key, file.type);
    await uploadChunkToS3(presignedUrl, file, (loaded) => {
      // For single file uploads, we can safely update bytes as we go
      uploadRef.current.uploadedBytes = loaded;
      updateProgress();
    });
    
    // Set to 100% only after single file upload completes
    setUploadState(prev => ({ 
      ...prev, 
      progress: 100, 
      remainingTime: 0 
    }));
  };

  const uploadFileInChunks = async (key: string, file: File) => {
    if (uploadRef.current.cancelled) return;

    const { uploadId } = await s3InitiateMultipartUpload(key, file.type);
    uploadRef.current.uploadId = uploadId;

    try {
      // Get existing parts first
      const uploadedParts = await s3ListUploadedParts(uploadId!, key);
      const uploadedPartsMap = new Map<number, { ETag: string; PartNumber: number }>();
      
      // Calculate already uploaded bytes from existing parts
      let alreadyUploadedBytes = 0;
      uploadedParts.forEach(part => {
        if (part.ETag && part.PartNumber) {
          uploadedPartsMap.set(part.PartNumber, {
            ETag: part.ETag,
            PartNumber: part.PartNumber
          });
          uploadRef.current.completedParts.add(part.PartNumber);
          alreadyUploadedBytes += part.Size || 0;
        }
      });
      
      // Set initial uploaded bytes (for resume functionality)
      uploadRef.current.uploadedBytes = alreadyUploadedBytes;

      // Create chunks dynamically
      const createChunks = () => {
        const chunks: { start: number; end: number; partNumber: number }[] = [];
        let start = 0;
        let partNumber = 1;
        
        while (start < file.size) {
          const end = Math.min(start + uploadRef.current.chunkSize, file.size);
          chunks.push({ start, end, partNumber });
          start = end;
          partNumber++;
        }
        return chunks;
      };

      const chunks = createChunks();
      let activeUploads = 0;
      let chunkIndex = 0;

      // Process chunks with high concurrency
      const processNextChunk = async (): Promise<void> => {
        while (chunkIndex < chunks.length && !uploadRef.current.cancelled) {
          const chunk = chunks[chunkIndex++];
          
          // Skip if already uploaded
          if (uploadedPartsMap.has(chunk.partNumber)) {
            continue;
          }

          activeUploads++;
          
          // Upload chunk
          uploadPart(file, chunk, uploadId!, key, uploadedPartsMap)
            .then(() => {
              activeUploads--;
              // Adaptive chunking: adjust size based on current speed
              if (adaptiveChunking && uploadRef.current.speedSamples.length > 5) {
                // Calculate current speed from recent samples for chunk size adjustment
                const recentSamples = uploadRef.current.speedSamples.slice(-3);
                if (recentSamples.length >= 2) {
                  const timeDiff = (recentSamples[recentSamples.length - 1].timestamp - recentSamples[0].timestamp) / 1000;
                  const bytesDiff = recentSamples[recentSamples.length - 1].bytes - recentSamples[0].bytes;
                  if (timeDiff > 0) {
                    const currentSpeedMBps = (bytesDiff / (1024 * 1024)) / timeDiff;
                    const newChunkSize = calculateOptimalChunkSize(currentSpeedMBps);
                    if (newChunkSize !== uploadRef.current.chunkSize) {
                      uploadRef.current.chunkSize = newChunkSize;
                      console.log(`Adjusted chunk size to ${newChunkSize / (1024 * 1024)}MB based on speed: ${currentSpeedMBps.toFixed(1)} MB/s`);
                    }
                  }
                }
              }
            })
            .catch(error => {
              activeUploads--;
              console.error('Chunk upload failed:', error);
            });

          // Control concurrency
          if (activeUploads >= maxConcurrent) {
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 10));
            while (activeUploads >= maxConcurrent && !uploadRef.current.cancelled) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // Wait for all active uploads to complete
        while (activeUploads > 0 && !uploadRef.current.cancelled) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };

      await processNextChunk();

      if (!uploadRef.current.cancelled) {
        const sortedParts = Array.from(uploadedPartsMap.values())
          .sort((a, b) => a.PartNumber - b.PartNumber);
        await s3CompleteMultipartUpload(uploadId!, key, sortedParts);
        
        // Set progress to 100% only after successful completion
        setUploadState(prev => ({ 
          ...prev, 
          progress: 100, 
          remainingTime: 0,
          status: 'completed' 
        }));
      }
    } catch (error) {
      try {
        await s3AbortMultipartUpload(uploadId!, key);
      } catch {}
      throw error;
    }
  };

  const uploadPart = async (
    file: File,
    chunk: { start: number; end: number; partNumber: number },
    uploadId: string,
    key: string,
    uploadedPartsMap: Map<number, { ETag: string; PartNumber: number }>
  ) => {
    if (uploadRef.current.cancelled) return;

    const chunkBlob = file.slice(chunk.start, chunk.end);
    
    try {
      const { presignedUrl } = await s3GenerateUploadPartUrl(uploadId, key, chunk.partNumber);
      
      const ETag = await uploadChunkToS3(presignedUrl, chunkBlob, (loaded) => {
        // Don't update uploaded bytes here - only when part is complete
        // This prevents progress from going over 100%
        updateProgress();
      });

      if (ETag && !uploadRef.current.completedParts.has(chunk.partNumber)) {
        uploadedPartsMap.set(chunk.partNumber, { ETag, PartNumber: chunk.partNumber });
        uploadRef.current.completedParts.add(chunk.partNumber);
        
        // Only add to uploaded bytes when part is completely finished
        uploadRef.current.uploadedBytes += chunkBlob.size;
        
        // Record total bytes uploaded at this timestamp for throughput calculation
        const now = Date.now();
        uploadRef.current.speedSamples.push({
          timestamp: now,
          bytes: uploadRef.current.uploadedBytes
        });
        
        // Only keep samples if we have too many (don't filter on every update)
        if (uploadRef.current.speedSamples.length > 50) {
          const cutoffTime = now - 30000; // Keep 30 seconds worth
          uploadRef.current.speedSamples = uploadRef.current.speedSamples.filter(
            sample => sample.timestamp > cutoffTime
          );
        }
        
        // Update progress after part completion
        updateProgress();
      }
    } catch (error) {
      // No need to adjust bytes since we don't add them until completion
      throw error;
    }
  };

  const uploadChunkToS3 = async (
    url: string,
    chunk: Blob,
    onProgress?: (loaded: number) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (uploadRef.current.cancelled) {
        reject(new Error('Upload cancelled'));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.timeout = 600000; // 10 minutes for large chunks

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress && !uploadRef.current.cancelled) {
          onProgress(event.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const ETag = xhr.getResponseHeader("ETag");
          if (ETag) {
            resolve(ETag);
          } else {
            reject(new Error("Failed to get ETag"));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Upload timeout"));

      xhr.send(chunk);
    });
  };

  return { 
    uploadFile, 
    cancelUpload,
    ...uploadState 
  };
};