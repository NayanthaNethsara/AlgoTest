"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/challenges", label: "Challenges" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/submissions", label: "Submissions" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center gap-6 border-b px-4 py-2.5">
      <span className="text-sm font-semibold tracking-tight">MiniAlgothon</span>
      <nav className="flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
