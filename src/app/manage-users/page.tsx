import { auth } from "@/lib/auth";
import { columns } from "./components/columns";
import { DataTable } from "./components/data-table";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session?.user.role === "admin") {
    const { users } = await auth.api.listUsers({
      query: {},
      headers: await headers(),
    });
    return (
      <div className="pt-12 flex flex-col gap-2 mx-auto max-w-4xl">
        <DataTable columns={columns} data={users} />
      </div>
    );
  }
  return notFound();
}
