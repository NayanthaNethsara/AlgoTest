import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserAction } from "@/lib/actions/auth";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserAction();
  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state");
  const defaultOpen = sidebarCookie ? sidebarCookie.value === "true" : true;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar user={user} />
      <SidebarInset>
        <AppHeader />
        <main id="main-content" className="flex flex-1 flex-col min-h-0">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
