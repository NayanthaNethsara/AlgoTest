const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

export type SubmissionResult = {
  submission_id: string;
  status: SubmissionStatus;
  output: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createSubmission(language: string, code: string) {
  return request<{ id: string; status: SubmissionStatus }>("/api/v1/submissions", {
    method: "POST",
    body: JSON.stringify({ language, code }),
  });
}

export function getSubmission(id: string) {
  return request<SubmissionResult>(`/api/v1/submissions/${id}`);
}
