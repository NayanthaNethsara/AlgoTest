"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ContestHeaderControls } from "@/components/contest/contest-header-controls";

function getPageMetadata(pathname: string): { section: string; sectionHref: string; title: string } {
  if (pathname === "/") return { section: "Dashboard", sectionHref: "/", title: "Overview" };
  if (pathname.startsWith("/problems")) return { section: "Management", sectionHref: "/problems", title: "Problems" };
  if (pathname.startsWith("/users")) return { section: "Management", sectionHref: "/users", title: "Users" };
  if (pathname.startsWith("/teams")) return { section: "Management", sectionHref: "/teams", title: "Teams" };
  if (pathname.startsWith("/submissions")) return { section: "Judge", sectionHref: "/submissions", title: "Submissions" };
  if (pathname.startsWith("/monitoring")) return { section: "Observability", sectionHref: "/monitoring", title: "Monitoring" };
  if (pathname.startsWith("/timer")) return { section: "Contest", sectionHref: "/timer", title: "Contest Timer" };
  if (pathname.startsWith("/audit")) return { section: "Judge", sectionHref: "/audit", title: "Audit Logs" };
  if (pathname.startsWith("/support")) return { section: "Help", sectionHref: "/support", title: "Support & FAQ" };
  if (pathname.startsWith("/privacy")) return { section: "Help", sectionHref: "/privacy", title: "Privacy Policy" };
  return { section: "Admin", sectionHref: "/", title: "Console" };
}

export function AppHeader() {
  const pathname = usePathname();
  const { section, sectionHref, title } = getPageMetadata(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink render={<Link href={sectionHref} />}>
                {section}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ContestHeaderControls />
      </div>
    </header>
  );
}
