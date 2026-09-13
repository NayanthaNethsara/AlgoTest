import { Metadata } from "next";
import { getAdminContestStateAction } from "@/lib/actions/contest";
import { ContestTimerClient } from "@/components/timer/contest-timer-client";

export const metadata: Metadata = {
  title: "Contest Timer & Projector | MiniAlgothon Admin",
  description: "Full-screen contest timer and projector control console for MiniAlgothon.",
};

export default async function ContestTimerPage() {
  const initialContestState = await getAdminContestStateAction();

  return (
    <div className="flex h-full max-h-full w-full flex-1 flex-col items-center justify-between overflow-hidden">
      <ContestTimerClient initialContestState={initialContestState} />
    </div>
  );
}
