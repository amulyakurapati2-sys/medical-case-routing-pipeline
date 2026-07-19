/** Defensively extract one JSON object from model content. */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Empty model content");
  }

  // Strip common markdown fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back: first {...} object in the string.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Could not extract JSON object from model content");
  }
}
