import { getAdminUploadConfigAction } from "@/lib/actions/auth";
import { downloadBlob } from "@/lib/file-utils";
import type { TestCaseMetadata } from "@/types/problem";

export interface SingleTestUploadItem {
  input: File | Blob | string;
  inputFileName?: string;
  expected: File | Blob | string;
  expectedFileName?: string;
  points?: number;
}

let cachedConfig: { token: string; apiUrl: string } | null = null;

export async function getUploadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const config = await getAdminUploadConfigAction();
  if (!config) {
    throw new Error("You must be logged in as an administrator to manage test cases.");
  }
  cachedConfig = config;
  return config;
}

export function resetUploadConfigCache() {
  cachedConfig = null;
}

export async function uploadSingleTestCase(
  problemId: string,
  item: SingleTestUploadItem,
  onProgress?: (percent: number) => void
): Promise<TestCaseMetadata> {
  const config = await getUploadConfig();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests`;

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${config.token}`);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.test);
        } catch {
          reject(new Error("Invalid response from test upload server"));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || `Upload failed with HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection error during test case upload"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Test case upload timed out"));
    };

    const formData = new FormData();
    if (typeof item.input === "string") {
      formData.append("input", item.input);
    } else {
      formData.append("input", item.input, item.inputFileName || "input.txt");
    }

    if (typeof item.expected === "string") {
      formData.append("expected", item.expected);
    } else {
      formData.append("expected", item.expected, item.expectedFileName || "output.txt");
    }

    formData.append("points", String(item.points || 0));

    xhr.send(formData);
  });
}

export async function updateSingleTestCase(
  problemId: string,
  ordinal: number,
  item: {
    input?: File | Blob | string;
    expected?: File | Blob | string;
    points?: number;
  },
  onProgress?: (percent: number) => void
): Promise<TestCaseMetadata> {
  const config = await getUploadConfig();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/${ordinal}`;

    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${config.token}`);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.test);
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || `Update failed with HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Update failed with HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network connection error"));

    const formData = new FormData();
    if (item.input !== undefined) {
      if (typeof item.input === "string") {
        formData.append("input", item.input);
      } else {
        formData.append("input", item.input, "input.txt");
      }
    }

    if (item.expected !== undefined) {
      if (typeof item.expected === "string") {
        formData.append("expected", item.expected);
      } else {
        formData.append("expected", item.expected, "output.txt");
      }
    }

    if (item.points !== undefined) {
      formData.append("points", String(item.points));
    }

    xhr.send(formData);
  });
}

export async function deleteSingleTestCase(problemId: string, ordinal: number): Promise<void> {
  const config = await getUploadConfig();
  const res = await fetch(
    `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/${ordinal}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to delete test case #${ordinal}`);
  }
}

export async function updateTestPoints(
  problemId: string,
  pointsMap: Record<number, number>
): Promise<void> {
  const config = await getUploadConfig();
  const numericMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(pointsMap)) {
    numericMap[k] = Number(v);
  }

  const res = await fetch(
    `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/points`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ points: numericMap }),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update test points");
  }
}

export async function fetchTestCaseContent(
  problemId: string,
  ordinal: number,
  field: "input" | "expected"
): Promise<string> {
  const config = await getUploadConfig();
  const res = await fetch(
    `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/${ordinal}/${field}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to load test case ${field}`);
  }

  return res.text();
}

export async function downloadTestCaseFile(
  problemId: string,
  ordinal: number,
  field: "input" | "expected"
): Promise<void> {
  const config = await getUploadConfig();
  const res = await fetch(
    `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/${ordinal}/${field}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to download test case ${field}`);
  }

  const blob = await res.blob();
  downloadBlob(`case_${ordinal}.${field === "input" ? "in" : "out"}`, blob);
}

export async function downloadTestCasesZip(problemId: string, problemSlug: string): Promise<void> {
  const config = await getUploadConfig();
  const res = await fetch(
    `${config.apiUrl}/api/v1/admin/problems/${encodeURIComponent(problemId)}/tests/export`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to export test cases ZIP");
  }

  const blob = await res.blob();
  downloadBlob(`${problemSlug || "problem"}_tests.zip`, blob);
}
