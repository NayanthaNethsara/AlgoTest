"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { isDesktopClient } from "@/lib/desktop";
import { ExitCompetitionModal } from "@/components/portal/exit-competition-modal";

const emptySubscribe = () => () => {};

export function DesktopWindowControls({
  className,
}: {
  className?: string;
} = {}) {
  const isDesktop = useSyncExternalStore(
    emptySubscribe,
    () => isDesktopClient(),
    () => false,
  );
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);

  useEffect(() => {
    function handleRequestExit() {
      setIsConfirmingExit(true);
    }

    window.addEventListener("minialgothon:request-exit", handleRequestExit);

    return () => {
      window.removeEventListener("minialgothon:request-exit", handleRequestExit);
    };
  }, []);

  if (!isDesktop) return null;

  return (
    <>
      <div
        className={
          className ??
          "flex items-center gap-1.5 border-l-2 border-black pl-1.5 sm:pl-2.5 ml-0.5 select-none shrink-0"
        }
      >
        <button
          type="button"
          id="btn-exit-competition"
          onClick={() => setIsConfirmingExit(true)}
          title="Exit Competition (Cleanly stops proctoring and closes client)"
          aria-label="Exit Competition"
          className="flex h-7 items-center gap-1.5 px-2 pixel-flat bg-card hover:bg-destructive/15 text-destructive border border-destructive/40 transition-colors cursor-pointer text-xs font-semibold"
        >
          <LogOut className="h-3.5 w-3.5 stroke-[2.5]" />
          <span className="hidden md:inline">Exit Competition</span>
        </button>
      </div>

      <ExitCompetitionModal
        open={isConfirmingExit}
        onOpenChange={setIsConfirmingExit}
      />
    </>
  );
}

export const DesktopExitButton = DesktopWindowControls;


