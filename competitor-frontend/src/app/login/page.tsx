import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { DesktopWindowControls } from "@/components/portal/desktop-window-controls";
import { getSessionUser } from "@/lib/auth/session";
import { Terminal } from "lucide-react";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/challenges");

  return (
    <div className="relative flex h-dvh flex-col bg-background select-none">
      <div className="h-12 w-full flex items-center justify-end px-4 z-50 shrink-0">
        <DesktopWindowControls />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="flex w-full max-w-md flex-col gap-6 pixel-raised bg-card p-8">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center pixel-flat bg-primary text-primary-foreground">
              <Terminal className="h-5 w-5" />
            </div>
            <h1 className="text-sm font-pixel-header text-primary tracking-widest mt-2">
              MiniAlgothon
            </h1>
            <p className="text-xs text-muted-foreground">
              Sign in with your competitor credentials
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
