import { redirect } from "next/navigation";
import { getSessionUserAction } from "@/lib/actions/auth";
import { AdminNavbar } from "@/components/navbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserAction();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AdminNavbar user={user} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
