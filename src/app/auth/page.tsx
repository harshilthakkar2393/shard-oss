import AuthPage from "@/components/auth/auth-page";
import { userGetCount } from "@/data-access/user";
import { auth } from "@/lib/auth";
import { tryCatch } from "@/lib/try-catch";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    const { data: count, error } = await tryCatch(userGetCount());
    console.log(count)
    return <AuthPage signup={!count} />;
  }
  redirect("/");
}
