"use server";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2CommandOutput,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.S3_KEY_ID!,
    secretAccessKey: process.env.S3_APPLICATION_KEY!,
  },
  region: process.env.S3_REGION!,
  endpoint: process.env.S3_ENDPOINT!,
});

/**
 * Generates a pre-signed URL for accessing a file in S3.
 * Allows direct retrieval of the specified file from the S3 bucket.
 *
 * @param {string} key - The key (file path) of the file in the S3 bucket.
 * @param [expiresIn=28,800] - Expiration time of the url in seconds , default value is 28,800(8 hours)
 * @param [check=false] - Double check if the file actually exists and throw error if ot doesnt.
 * @returns A pre-signed URL for accessing the file.
 * @throws Will throw an error if the URL generation fails.
 */
export async function s3GetPreSignedUrl(
  key: string,
  expiresIn = 28800,
  check = false
): Promise<string> {
  try {
    if (check) {
      // Generate separate HEAD URL for validation
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME, // s3 bucket
        Key: key,
      });
      const headUrl = await getSignedUrl(s3Client, headCommand, {
        expiresIn: 60,
      });

      // Test with HEAD
      const testResponse = await fetch(headUrl, { method: "HEAD" });

      if (!testResponse.ok) {
        throw new Error("URL validation failed");
      }
    }

    const command = new GetObjectCommand({
      // Bucket: process.env.S3AWS_BUCKET_NAME, // s3 bucket
      Bucket: process.env.S3_BUCKET_NAME, // s3 bucket
      Key: key,
    });

    // Generate a pre-signed URL
    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresIn });
    return url;
  } catch (error) {
    console.error("Error generating object URL:", error);
    throw new Error("Failed to generate object URL.");
  }
}

/**
 * Lists all objects in a S3 bucket with the specified prefix.
 * Returns all files in the folder/path specified by the prefix.
 * Handles pagination automatically to retrieve more than 1000 objects.
 *
 * @param {string} prefix - The prefix (folder path) to filter objects by.
 * @returns Promise<Array> - Array of objects with Key, LastModified, Size, etc.
 * @throws Will throw an error if the listing fails.
 */
export async function s3ListObjects(prefix: string) {
  try {
    const allObjects: any[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response: ListObjectsV2CommandOutput = await s3Client.send(command);

      // Add objects from this batch to our collection
      if (response.Contents) {
        allObjects.push(...response.Contents);
      }

      // Check if there are more objects to fetch
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return allObjects;
  } catch (error) {
    console.error("Error listing objects:", error);
    throw new Error("Failed to list objects.");
  }
}

/**
 * Deletes a single object from the S3 bucket.
 *
 * @param {string} key - The key (file path) of the file to delete.
 * @returns Promise<void>
 * @throws Will throw an error if the deletion fails.
 */
export async function s3DeleteObject(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`Successfully deleted object: ${key}`);
  } catch (error) {
    console.error("Error deleting object:", error);
    throw new Error(`Failed to delete object: ${key}`);
  }
}

/**
 * Deletes multiple objects from the S3 bucket in batches.
 *
 * @param {string[]} keys - Array of keys (file paths) to delete.
 * @returns Promise<void>
 * @throws Will throw an error if the deletion fails.
 */
export async function s3DeleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  // Split into chunks of 1000 (AWS limit)
  const chunks = [];
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000));
  }

  for (const chunk of chunks) {
    const command = new DeleteObjectsCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Delete: {
        Objects: chunk.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    await s3Client.send(command);
  }
}

/**
 * Deletes an entire folder and all its contents recursively.
 *
 * @param {string} folderPath - The folder path to delete (e.g., "users/123/" or "uploads/images/")
 * @returns Promise<void>
 * @throws Will throw an error if the deletion fails.
 */
export async function s3DeleteFolder(folderPath: string): Promise<void> {
  try {
    // Ensure folder path ends with / for proper prefix matching
    const normalizedPath = folderPath.endsWith("/")
      ? folderPath
      : `${folderPath}/`;

    // Get all objects in the folder
    const objects = await s3ListObjects(normalizedPath);

    if (objects.length === 0) {
      console.log(`No files found in folder: ${normalizedPath}`);
      return;
    }

    // Extract keys and delete all objects
    const keysToDelete = objects.map((obj) => obj.Key!).filter((key) => key);
    await s3DeleteObjects(keysToDelete);

    console.log(
      `Successfully deleted folder: ${normalizedPath} (${keysToDelete.length} files)`
    );
  } catch (error) {
    console.error("Error deleting folder:", error);
    throw new Error(`Failed to delete folder: ${folderPath}`);
  }
}

/**
 * Initiates a multipart upload for large files.
 *
 * @param {string} key - The key (file path) for the upload
 * @param {string} contentType - The MIME type of the file
 * @returns Promise<{ uploadId: string }>
 * @throws Will throw an error if initiation fails.
 */
export async function s3InitiateMultipartUpload(
  key: string,
  contentType: string
): Promise<{ uploadId: string }> {
  try {
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const response = await s3Client.send(command);
    if (!response.UploadId) {
      throw new Error("Failed to initiate multipart upload.");
    }

    return { uploadId: response.UploadId };
  } catch (error) {
    console.error("Error initiating multipart upload:", error);
    throw new Error("Could not initiate upload.");
  }
}

/**
 * Generates a pre-signed URL for uploading a single part in multipart upload.
 *
 * @param {string} uploadId - The upload ID from initiate multipart upload
 * @param {string} key - The key (file path) for the upload
 * @param {number} partNumber - The part number (1-based)
 * @returns Promise<{ presignedUrl: string }>
 * @throws Will throw an error if URL generation fails.
 */
export async function s3GenerateUploadPartUrl(
  uploadId: string,
  key: string,
  partNumber: number
): Promise<{ presignedUrl: string }> {
  try {
    const command = new UploadPartCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return { presignedUrl };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Could not generate presigned URL.");
  }
}

/**
 * Completes a multipart upload by combining all uploaded parts.
 *
 * @param {string} uploadId - The upload ID from initiate multipart upload
 * @param {string} key - The key (file path) for the upload
 * @param {Array} parts - Array of completed parts with ETag and PartNumber
 * @returns Promise<object>
 * @throws Will throw an error if completion fails.
 */
export async function s3CompleteMultipartUpload(
  uploadId: string,
  key: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<object> {
  try {
    const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error completing upload:", error);
    try {
      await s3AbortMultipartUpload(uploadId, key);
    } catch {}
    throw new Error("Could not complete multipart upload.");
  }
}

/**
 * Aborts a multipart upload and cleans up any uploaded parts.
 *
 * @param {string} uploadId - The upload ID to abort
 * @param {string} key - The key (file path) for the upload
 * @returns Promise<void>
 * @throws Will throw an error if abort fails.
 */
export async function s3AbortMultipartUpload(
  uploadId: string,
  key: string
): Promise<void> {
  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Error aborting multipart upload:", error);
  }
}

/**
 * Lists all uploaded parts for a multipart upload.
 *
 * @param {string} uploadId - The upload ID to list parts for
 * @param {string} key - The key (file path) for the upload
 * @returns Promise<Array>
 * @throws Will throw an error if listing fails.
 */
export async function s3ListUploadedParts(
  uploadId: string,
  key: string
): Promise<any[]> {
  try {
    const command = new ListPartsCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    const response = await s3Client.send(command);
    return response.Parts || [];
  } catch (error) {
    console.error("Error listing uploaded parts:", error);
    throw new Error("Could not list uploaded parts.");
  }
}

/**
 * Generates a pre-signed URL for direct file upload (for small files).
 *
 * @param {string} key - The key (file path) for the upload
 * @param {string} contentType - The MIME type of the file
 * @returns Promise<string>
 * @throws Will throw an error if URL generation fails.
 */
export async function s3GetUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 7200,
    });
    return uploadUrl;
  } catch (error) {
    console.error("Error generating upload URL:", error);
    throw new Error("Failed to generate upload URL.");
  }
}
