import { SubmissionForm } from "@/components/submission-form";

export default function Home() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">MiniAlgothon</h1>
        <p className="text-sm text-muted-foreground">
          Write your solution and let the judge run it.
        </p>
      </header>
      <SubmissionForm />
    </main>
  );
}
