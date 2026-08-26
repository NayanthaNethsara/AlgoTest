import type { Metadata } from "next";
import { DOC_LANGUAGES } from "@/lib/docs";
import { DocsHubView } from "@/components/docs/docs-hub-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { proctorLocksContest } from "@/lib/proctor";
import { readProctorGate } from "@/lib/proctor-gate";

export const metadata: Metadata = {
  title: "Language Documentation & Guides | MiniAlgothon",
  description:
    "Syntax and language reference guides for C++, Python, and JavaScript.",
};

export default async function DocsPage() {
  if (proctorLocksContest(await readProctorGate())) return null;

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
        <DocsHubView languages={DOC_LANGUAGES} />
      </div>
    </ScrollArea>
  );
}
