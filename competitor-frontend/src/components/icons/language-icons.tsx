import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export function CppIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 overflow-hidden",
        className,
      )}
    >
      <Image
        src="/logo/cpp.svg.webp"
        alt="C++ Logo"
        width={250}
        height={282}
        className="h-full w-full object-contain p-0.5"
        unoptimized
      />
    </div>
  );
}

export function PythonIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 overflow-hidden",
        className,
      )}
    >
      <Image
        src="/logo/python.svg.webp"
        alt="Python Logo"
        width={250}
        height={250}
        className="h-full w-full object-contain p-0.5"
        unoptimized
      />
    </div>
  );
}

export function JavaScriptIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 overflow-hidden",
        className,
      )}
    >
      <Image
        src="/logo/js.svg.webp"
        alt="JavaScript Logo"
        width={250}
        height={250}
        className="h-full w-full object-contain p-0.5"
        unoptimized
      />
    </div>
  );
}
