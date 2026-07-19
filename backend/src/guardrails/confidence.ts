/** Low-confidence classifications require human review rather than failing. */
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
