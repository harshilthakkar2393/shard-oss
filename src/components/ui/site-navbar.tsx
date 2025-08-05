"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Avatar, AvatarFallback } from "./avatar";
import { IconLogout2, IconUserCog, IconUsersGroup } from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
type UserWithRole = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null | undefined | undefined;
  banned: boolean | null | undefined;
  role?: string | null | undefined;
};
export default function SiteNavbar({ user }: { user?: UserWithRole }) {
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
                <AvatarFallback>
                  {user.name.split(" ")[0][0]}
                  {user.name.split(" ")[1][0]}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {user.role === "admin" && (
                <>
                  <Link href={"/manage-users"}>
                    <DropdownMenuItem>
                      <IconUsersGroup />
                      Manage Users
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                </>
              )}
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
