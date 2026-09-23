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

export function RustIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 text-orange-500",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        fill="currentColor"
        className="h-full w-full object-contain"
        aria-label="Rust Logo"
      >
        <path d="M16 2.5a13.5 13.5 0 1 0 13.5 13.5A13.515 13.515 0 0 0 16 2.5zm0 2.2a11.3 11.3 0 1 1-11.3 11.3A11.313 11.313 0 0 1 16 4.7zm-4.2 4.5h4.6a4.1 4.1 0 0 1 4.1 4.1 3.9 3.9 0 0 1-2.4 3.6l2.8 5.7h-2.6l-2.4-5.2h-1.8v5.2h-2.3zm2.3 2.1v3.9h2.3a1.95 1.95 0 0 0 2-2 1.95 1.95 0 0 0-2-1.9z" />
      </svg>
    </div>
  );
}

export function JavaIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 text-rose-500",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full object-contain p-0.5"
        aria-label="Java Logo"
      >
        <path d="M11 26c4 1.5 10 1.5 14 0" stroke="currentColor" />
        <path d="M8 22c7 2 13 2 18 0" stroke="currentColor" />
        <path d="M10 17c5 1.5 10 1.5 14 0" stroke="currentColor" />
        <path d="M14 12c-2-3 2-6 0-9" stroke="#38bdf8" />
        <path d="M19 10c-2-3 1-5 0-7" stroke="#38bdf8" />
      </svg>
    </div>
  );
}

export function CIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 text-blue-500",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        fill="currentColor"
        className="h-full w-full object-contain"
        aria-label="C Logo"
      >
        <path d="M16 3C8.82 3 3 8.82 3 16s5.82 13 13 13c4.54 0 8.52-2.33 10.84-5.88l-4.14-2.4C21.32 22.84 18.86 24.3 16 24.3c-4.58 0-8.3-3.72-8.3-8.3s3.72-8.3 8.3-8.3c2.86 0 5.32 1.46 6.7 3.58l4.14-2.4C24.52 5.33 20.54 3 16 3z" />
      </svg>
    </div>
  );
}

export function AlgorithmsIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <div
      className={cn(
        "relative aspect-square inline-flex items-center justify-center shrink-0 text-emerald-400",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full object-contain p-0.5"
        aria-label="Algorithms Icon"
      >
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="19" r="3" />
        <circle cx="19" cy="19" r="3" />
        <line x1="12" y1="8" x2="5" y2="16" />
        <line x1="12" y1="8" x2="19" y2="16" />
        <line x1="5" y1="19" x2="19" y2="19" strokeDasharray="2 2" />
      </svg>
    </div>
  );
}
