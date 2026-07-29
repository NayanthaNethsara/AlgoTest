import { ChallengeCard } from "@/components/challenges/challenge-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getChallengeProgress } from "@/lib/challenges";
import { listProblems } from "@/lib/problems";

export default async function ChallengesPage() {
  const problems = await listProblems();

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        {problems.map((problem) => (
          <ChallengeCard
            key={problem.id}
            problem={problem}
            progress={getChallengeProgress(problem.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
