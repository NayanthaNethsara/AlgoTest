import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOC_LANGUAGES, getLanguageDoc } from "@/lib/docs";
import { DocsLanguageView } from "@/components/docs/docs-language-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { proctorLocksContest } from "@/lib/proctor";
import { readProctorGate } from "@/lib/proctor-gate";

interface DocsLanguagePageProps {
  params: Promise<{
    language: string;
  }>;
}

export async function generateStaticParams() {
  return DOC_LANGUAGES.map((lang) => ({
    language: lang.slug,
  }));
}

export async function generateMetadata({
  params,
}: DocsLanguagePageProps): Promise<Metadata> {
  const { language } = await params;
  const doc = getLanguageDoc(language);
  if (!doc) {
    return {
      title: "Docs Not Found | MiniAlgothon",
    };
  }

  return {
    title: `${doc.name} Language Guide & Syntax Reference | MiniAlgothon`,
    description: doc.summary,
  };
}

export default async function DocsLanguagePage({
  params,
}: DocsLanguagePageProps) {
  if (proctorLocksContest(await readProctorGate())) return null;

  const { language } = await params;
  const doc = getLanguageDoc(language);

  if (!doc) {
    notFound();
  }

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
        <DocsLanguageView language={doc} allLanguages={DOC_LANGUAGES} />
      </div>
    </ScrollArea>
  );
}
