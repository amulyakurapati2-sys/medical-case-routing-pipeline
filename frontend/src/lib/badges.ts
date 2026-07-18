/** Tailwind class maps for status/priority/source badges + confidence tone. UI-only. */
import type { CaseStatus, EventSource, Priority } from "@/api/types";

export const statusClasses: Record<CaseStatus, string> = {
  RECEIVED: "bg-slate-100 text-slate-700 border-slate-200",
  SCRUBBED: "bg-slate-100 text-slate-700 border-slate-200",
  CLASSIFIED: "bg-blue-100 text-blue-700 border-blue-200",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800 border-amber-300",
  ASSIGNED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REASSIGNED: "bg-teal-100 text-teal-700 border-teal-200",
  UNASSIGNABLE: "bg-orange-100 text-orange-800 border-orange-300",
  FAILED: "bg-red-100 text-red-700 border-red-200",
};

export const priorityClasses: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
  MEDIUM: "bg-sky-100 text-sky-700 border-sky-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
};

export const sourceClasses: Record<EventSource, string> = {
  SYSTEM: "bg-slate-100 text-slate-600 border-slate-200",
  LLM: "bg-violet-100 text-violet-700 border-violet-200",
  GUARDRAIL: "bg-cyan-100 text-cyan-700 border-cyan-200",
  HUMAN: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

/** Green when confidence clears the (default 0.7) threshold, amber when below. */
export function confidenceTone(
  confidence: number,
  threshold = 0.7,
): { label: string; classes: string } {
  const pct = `${Math.round(confidence * 100)}%`;
  return confidence >= threshold
    ? { label: pct, classes: "text-emerald-700" }
    : { label: pct, classes: "text-amber-700" };
}
