import { redirect } from "next/navigation";

export default async function ProblemDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/problems/${id}/edit`);
}
