"use client";

import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  ChevronsUpDownIcon,
  FileCode2Icon,
  HelpCircleIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TimerIcon,
  Users2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/types/user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAVIGATION_SECTIONS: NavSection[] = [
  {
    label: "Contest Operations",
    items: [
      { title: "Overview", href: "/", icon: LayoutDashboardIcon },
      { title: "Contest Timer", href: "/timer", icon: TimerIcon },
      { title: "Onsite Monitoring", href: "/monitoring", icon: ActivityIcon },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Problems", href: "/problems", icon: FileCode2Icon },
      { title: "Users", href: "/users", icon: UsersIcon },
      { title: "Teams", href: "/teams", icon: Users2Icon },
    ],
  },
  {
    label: "Judge & Audit",
    items: [
      { title: "Submissions & Judge", href: "/submissions", icon: HistoryIcon },
      { title: "Audit Logs", href: "/audit", icon: ShieldCheckIcon },
    ],
  },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(user: User): string {
  const source = (user.displayName || user.username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, startLogout] = useTransition();

  function handleLogout() {
    startLogout(async () => {
      await logoutAction();
      router.push("/login");
      router.refresh();
    });
  }

  const displayName = user.displayName || user.username;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border" {...props}>
      {/* Brand Header matching AppHeader h-14 height exactly */}
      <SidebarHeader className="h-14 border-b border-sidebar-border px-2 flex justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="relative flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sidebar-border/80 bg-sidebar-accent shadow-xs">
                <Image
                  src="/sidebar-icon.png"
                  alt="Algothon"
                  width={32}
                  height={32}
                  className="size-8 object-cover rounded-lg"
                  priority
                />
              </div>
              <div className="flex flex-1 items-center justify-between gap-1.5 overflow-hidden">
                <span className="truncate font-semibold tracking-tight text-sidebar-foreground text-sm">
                  Algothon
                </span>
                <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider rounded-sm">
                  Admin
                </Badge>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation Sections */}
      <SidebarContent>
        {NAVIGATION_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isLinkActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User Account Footer */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={displayName}
                    className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                    aria-label="User profile menu"
                  />
                }
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-bold text-primary">
                    {initialsOf(user)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium text-sidebar-foreground">
                    {displayName}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {user.username} · {user.role}
                  </span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={8}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-2 py-1.5 text-left text-xs">
                      <Avatar className="size-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-bold text-primary">
                          {initialsOf(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-xs leading-tight">
                        <span className="truncate font-semibold text-foreground">
                          {displayName}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {user.username} · {user.role}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link href="/support" />}>
                    <HelpCircleIcon className="size-3.5 mr-2 text-muted-foreground" />
                    Support &amp; FAQ
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/privacy" />}>
                    <ShieldIcon className="size-3.5 mr-2 text-muted-foreground" />
                    Privacy Policy
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? (
                    <Spinner className="size-3.5 mr-2" />
                  ) : (
                    <LogOutIcon className="size-3.5 mr-2" />
                  )}
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Rail for quick collapse / expand */}
      <SidebarRail />
    </Sidebar>
  );
}
