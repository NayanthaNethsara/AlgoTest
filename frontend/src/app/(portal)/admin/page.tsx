import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import type { AdminUser } from "@/actions/admin";
import type { ProblemDetail } from "@/actions/problems";
import { ScrollArea } from "@/components/ui/scroll-area";
import { backendFetch } from "@/lib/api/server";
import { getSessionUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/challenges");

  const [usersRes, problemsRes] = await Promise.all([
    backendFetch("/api/v1/admin/users"),
    backendFetch("/api/v1/admin/problems"),
  ]);

  const usersData = usersRes.ok ? await usersRes.json() : { users: [] };
  const problemsData = problemsRes.ok ? await problemsRes.json() : { problems: [] };

  const users: AdminUser[] = usersData.users ?? [];
  const problems: ProblemDetail[] = problemsData.problems ?? [];

  return (
    <ScrollArea className="h-full">
      <AdminDashboard users={users} currentUserId={user.id} problems={problems} />
    </ScrollArea>
  );
}

