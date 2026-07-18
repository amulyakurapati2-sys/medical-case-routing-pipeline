/**
 * U4 — Confidence gate (CNF-*, Tier 2). Compares classification confidence to the
 * configured threshold. A failing verdict routes the case to NEEDS_REVIEW (human
 * approve/override) in U5 — it is NOT a failure. Pure (GRD-2).
 */
import { config } from "../config/env.js";

export type ConfidenceVerdict = {
  passed: boolean;
  score: number;
  threshold: number;
};

export function checkConfidence(
  score: number,
  threshold: number = config.CONFIDENCE_THRESHOLD,
): ConfidenceVerdict {
  return { passed: score >= threshold, score, threshold };
}
