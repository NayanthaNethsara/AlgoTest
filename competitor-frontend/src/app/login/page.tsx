import Image from "next/image";
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
            <div className="flex items-center gap-2.5 mt-2">
              <h1 className="text-sm font-pixel-header text-primary tracking-widest">
                Algothon
              </h1>
              <span
                className="text-muted-foreground/60 text-base leading-none select-none"
                aria-hidden="true"
              >
                |
              </span>
              <Image
                src="/logo/gtn-white.png"
                alt="GTN"
                width={1200}
                height={540}
                className="h-10 w-auto object-contain"
              />
            </div>
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
