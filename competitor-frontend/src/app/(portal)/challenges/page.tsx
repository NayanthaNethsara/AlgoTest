import { getContestStateAction } from "@/actions/contest";
import { listProblemsAction } from "@/actions/problems";
import { ChallengesListClient } from "@/components/challenges/challenges-list-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { proctorLocksContest } from "@/lib/proctor";
import { readProctorGate } from "@/lib/proctor-gate";
import { CONTEST_STATUS } from "@/types/contest";

export default async function ChallengesPage() {
  const [proctorStatus, contestState] = await Promise.all([
    readProctorGate(),
    getContestStateAction(),
  ]);

  if (
    contestState.status !== CONTEST_STATUS.NOT_STARTED &&
    proctorLocksContest(proctorStatus)
  ) {
    return null;
  }

  const { problems, progress } = await listProblemsAction();

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
        <ChallengesListClient problems={problems} progress={progress} />
      </div>
    </ScrollArea>
  );
}
