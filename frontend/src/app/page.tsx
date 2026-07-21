import { SubmissionForm } from "@/components/submission-form";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">MiniAlgothon</h1>
        <p className="text-sm opacity-70">Submit a solution and let the judge run it.</p>
      </header>
      <SubmissionForm />
    </main>
  );
}
