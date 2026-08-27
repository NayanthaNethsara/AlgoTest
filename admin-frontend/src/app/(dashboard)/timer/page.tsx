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
    <main className="min-h-full flex flex-col items-center justify-center">
      <ContestTimerClient initialContestState={initialContestState} />
    </main>
  );
}
