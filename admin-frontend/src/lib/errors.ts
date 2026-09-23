export class ApiError extends Error {
  readonly requestId?: string;
  readonly statusCode?: number;

  constructor(message: string, requestId?: string, statusCode?: number) {
    const formatted = requestId ? `${message} (Request ID: ${requestId})` : message;
    super(formatted);
    this.name = "ApiError";
    this.requestId = requestId;
    this.statusCode = statusCode;
  }
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function parseApiError(res: Response, fallbackMessage: string): Promise<ApiError> {
  const headerRequestId = res.headers.get("x-request-id") || undefined;
  let message = fallbackMessage;
  let bodyRequestId: string | undefined;

  try {
    const body = await res.json();
    if (typeof body?.error === "string" && body.error.trim()) {
      message = body.error.trim();
    }
    if (typeof body?.requestId === "string" && body.requestId.trim()) {
      bodyRequestId = body.requestId.trim();
    }
  } catch {
    // Response body was empty or not JSON.
  }

  return new ApiError(message, bodyRequestId || headerRequestId, res.status);
}
