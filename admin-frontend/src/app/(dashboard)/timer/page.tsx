import { Metadata } from "next";
import { PRODUCT_NAME } from "@labyrithm/branding";
import { getAdminContestStateAction } from "@/lib/actions/contest";
import { ContestTimerClient } from "@/components/timer/contest-timer-client";

export const metadata: Metadata = {
  title: `Session Timer & Projector | ${PRODUCT_NAME} Admin`,
  description: `Full-screen timer and projector control console for ${PRODUCT_NAME}.`,
};

export default async function ContestTimerPage() {
  const initialContestState = await getAdminContestStateAction();

  return (
    <div className="flex h-full max-h-full w-full flex-1 flex-col items-center justify-between overflow-hidden">
      <ContestTimerClient initialContestState={initialContestState} />
    </div>
  );
}
