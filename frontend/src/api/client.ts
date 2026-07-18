/**
 * Thin fetch wrapper around the U6 REST surface. Single source of API URLs.
 * Errors are normalized to `ApiError` carrying the backend's safe message + status.
 */
import type {
  CaseDetail,
  CaseSummary,
  PtoRequest,
  ReviewRequest,
  SpecialistVM,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new ApiError(
      payload.message ?? payload.error ?? res.statusText,
      res.status,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  listCases: () => request<CaseSummary[]>("GET", "/cases"),
  getCase: (id: string) => request<CaseDetail>("GET", `/cases/${id}`),
  createCase: (text: string) =>
    request<{ id: string }>("POST", "/cases", { text }),
  review: (id: string, body: ReviewRequest) =>
    request<{ accepted: boolean }>("POST", `/cases/${id}/review`, body),
  listSpecialists: () => request<SpecialistVM[]>("GET", "/specialists"),
  setPto: (id: string, body: PtoRequest) =>
    request<SpecialistVM>("PATCH", `/specialists/${id}`, body),

  /** Absolute URL for an EventSource connection to a case's SSE stream. */
  streamUrl: (id: string) => `${BASE}/cases/${id}/stream`,
};

/** Generate an idempotency key for state-changing commands (review / PTO). */
export function newCommandId(): string {
  return crypto.randomUUID();
}
