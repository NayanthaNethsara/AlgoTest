"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  FileCode2Icon,
  LayoutDashboardIcon,
  HistoryIcon,
  LogOutIcon,
  MenuIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TimerIcon,
  Users2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; shortLabel: string; icon: LucideIcon };

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Overview", shortLabel: "Overview", icon: LayoutDashboardIcon },
  { href: "/problems", label: "Problems", shortLabel: "Problems", icon: FileCode2Icon },
  { href: "/users", label: "Users", shortLabel: "Users", icon: UsersIcon },
  { href: "/teams", label: "Teams", shortLabel: "Teams", icon: Users2Icon },
  {
    href: "/submissions",
    label: "Submissions & Judge",
    shortLabel: "Submissions",
    icon: HistoryIcon,
  },
  { href: "/monitoring", label: "Onsite Monitoring", shortLabel: "Monitoring", icon: ActivityIcon },
  { href: "/timer", label: "Contest Timer", shortLabel: "Timer", icon: TimerIcon },
  { href: "/audit", label: "Audit Logs", shortLabel: "Audit", icon: ShieldCheckIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(user: User) {
  const source = (user.displayName || user.username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function AdminNavbar({ user, onRefresh }: { user: User; onRefresh?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
    <header className="sticky top-0 z-40 h-(--app-header-height) border-b border-border bg-card/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="text-sm font-bold tracking-tight">Algothon</span>
          <Badge
            variant="outline"
            className="border-primary/25 bg-primary/10 text-[10px] font-semibold tracking-wider text-primary uppercase"
          >
            Admin
          </Badge>
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  size: "sm",
                  className: cn(
                    "gap-1.5 text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  ),
                })}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="hidden xl:inline">{link.label}</span>
                <span className="xl:hidden">{link.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          {onRefresh && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRefresh}
                    aria-label="Refresh data"
                  />
                }
              >
                <RefreshCwIcon />
              </TooltipTrigger>
              <TooltipContent>Refresh data</TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden max-w-[180px] gap-2 pl-1 lg:inline-flex"
                  aria-label="Account menu"
                />
              }
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {initialsOf(user)}
              </span>
              <span className="truncate text-xs font-medium">{displayName}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {displayName}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {user.username} · {user.role}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link href="/support" />}>
                  Support &amp; FAQ
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/privacy" />}>
                  Privacy &amp; Policy
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? <Spinner /> : <LogOutIcon />}
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Open navigation menu"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,85vw)] p-0">
              <SheetHeader className="border-b px-4 py-4">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {initialsOf(user)}
                  </span>
                  <span className="truncate">{displayName}</span>
                </SheetTitle>
                <SheetDescription className="font-mono text-[11px]">
                  {user.username} · {user.role}
                </SheetDescription>
              </SheetHeader>

              <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
                {NAV_LINKS.map((link) => {
                  const active = isActive(pathname, link.href);
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {link.label}
                    </Link>
                  );
                })}
                <div className="my-2 border-t border-border/60" />
                <Link
                  href="/support"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Support &amp; FAQ
                </Link>
                <Link
                  href="/privacy"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Privacy &amp; Policy
                </Link>
              </nav>

              <div className="border-t p-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full gap-1.5"
                >
                  {loggingOut ? <Spinner /> : <LogOutIcon />} Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
