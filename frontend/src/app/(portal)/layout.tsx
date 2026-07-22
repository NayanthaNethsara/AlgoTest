import { TopNav } from "@/components/portal/top-nav";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <TopNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
