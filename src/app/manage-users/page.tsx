import { auth } from "@/lib/auth";
import { columns } from "./components/columns";
import { DataTable } from "./components/data-table";
import { headers } from "next/headers";
export default async function Page() {
  const { users, total } = await auth.api.listUsers({
    query: {},
    headers: await headers(),
  });
  return (
    <div className="mt-12 flex flex-col gap-2 mx-auto max-w-4xl">
      <h2 className="text-xl md:text-2xl font-medium">Users</h2>
      <DataTable columns={columns} data={users} />
    </div>
  );
}
