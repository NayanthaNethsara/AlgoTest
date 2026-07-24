import { redirect } from "next/navigation";
import { AdminUsers } from "@/components/admin/admin-users";
import type { AdminUser } from "@/actions/admin";
import { ScrollArea } from "@/components/ui/scroll-area";
import { backendFetch } from "@/lib/api/server";
import { getSessionUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/challenges");

  const res = await backendFetch("/api/v1/admin/users");
  const data = res.ok ? await res.json() : { users: [] };
  const users: AdminUser[] = data.users ?? [];

  return (
    <ScrollArea className="h-full">
      <AdminUsers users={users} currentUserId={user.id} />
    </ScrollArea>
  );
}
