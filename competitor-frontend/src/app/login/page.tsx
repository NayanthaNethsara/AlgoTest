import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/auth/session";
import { Terminal } from "lucide-react";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/challenges");

  return (
    <div className="flex h-dvh items-center justify-center bg-[radial-gradient(#262636_1px,transparent_1px)] [background-size:16px_16px]">
      <div className="flex w-full max-w-md flex-col gap-6 border-4 border-black bg-card p-8 shadow-[inset_3px_3px_0px_oklch(0.48_0.02_260),inset_-3px_-3px_0px_oklch(0.12_0.01_260),0px_8px_0px_#000000]">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-black bg-primary text-primary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.4),0px_4px_0px_#000000]">
            <Terminal className="h-6 w-6" />
          </div>
          <h1 className="text-sm font-pixel-header text-primary uppercase tracking-widest pixel-text-shadow mt-2">
            MINIALGOTHON
          </h1>
          <p className="text-xs text-muted-foreground font-pixel-body">
            ENTER YOUR COMPETITOR CREDENTIALS TO LOG IN
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
