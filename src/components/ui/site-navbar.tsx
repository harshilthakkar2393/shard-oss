"use client";
import { Button } from "@/components/ui/button";
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
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SiteNavbar({ user }: { user?: User }) {
  const router = useRouter();
  return (
    <nav className="sticky top-0 z-50 w-full h-14 flex items-center px-4 border mx-auto max-w-7xl justify-between bg-background">
      <Link
        href="/"
        className="text-primary hover:text-primary/90 text-lg font-semibold"
      >
        Shard
      </Link>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={"ghost"}
              size={"icon"}
              className="size-9 rounded-full"
            >
              <Avatar className="size-9">
                <AvatarFallback>{user.name[0]}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{user.name}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  await authClient.signOut({
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
    </nav>
  );
}
