import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 text-center bg-background text-foreground">
      <div className="max-w-md pixel-raised bg-card p-8 flex flex-col items-center gap-4">
        <div className="p-3 bg-amber-500/10 text-amber-400 pixel-flat">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Page Not Found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The requested page or challenge could not be found or is currently unavailable.
        </p>
        <Link
          href="/challenges"
          className="mt-2 pixel-flat bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Return to Challenges
        </Link>
      </div>
    </div>
  );
}
