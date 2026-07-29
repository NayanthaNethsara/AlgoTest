import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/challenges");

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">MiniAlgothon</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the credentials provided by the organizers.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
