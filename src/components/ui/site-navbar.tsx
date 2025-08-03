"use client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { User } from "better-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Avatar, AvatarFallback } from "./avatar";
import { IconLogout2 } from "@tabler/icons-react";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SiteNavbar({ user }: { user?: User }) {
  const router = useRouter();
  return (
    <header className="border-b px-4 md:px-6 w-full z-50 relative sticky">
      <div className="flex h-16 items-center justify-between gap-4">
        {/* Main nav */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-primary hover:text-primary/90 text-lg font-semibold"
          >
            Shard
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar>
                  <AvatarFallback>{user.name[0]}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>{user.name}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      await signOut({
                        fetchOptions: {
                          onSuccess: () => {
                            router.push("/"); // redirect to login page
                          },
                        },
                      });
                    }}
                  >
                    <IconLogout2 /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
