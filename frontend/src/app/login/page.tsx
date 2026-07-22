import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">MiniAlgothon</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
        <Button disabled>Sign in (not implemented)</Button>
      </div>
    </div>
  );
}
