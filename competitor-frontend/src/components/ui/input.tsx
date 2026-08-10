import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-none border-2 border-black bg-input px-3 text-xs font-pixel-body outline-none shadow-[inset_2px_2px_0px_#000000,inset_-2px_-2px_0px_oklch(0.28_0.02_260)] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
