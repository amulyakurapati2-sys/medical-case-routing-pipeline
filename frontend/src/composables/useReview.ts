/** Tier 2 human review (FR-5.1): idempotent APPROVE / OVERRIDE. Resume events arrive via SSE. */
import { ref } from "vue";
import { api, ApiError, newCommandId } from "@/api/client";
import type { Department, Priority } from "@/api/types";

export function useReview() {
  const submitting = ref(false);
  const error = ref<string | null>(null);

  async function approve(caseId: string): Promise<void> {
    submitting.value = true;
    error.value = null;
    try {
      await api.review(caseId, { commandId: newCommandId(), action: "APPROVE" });
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Review failed";
    } finally {
      submitting.value = false;
    }
  }

  async function override(
    caseId: string,
    category: Department,
    priority?: Priority,
  ): Promise<void> {
    submitting.value = true;
    error.value = null;
    try {
      await api.review(caseId, {
        commandId: newCommandId(),
        action: "OVERRIDE",
        overrideCategory: category,
        overridePriority: priority,
      });
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Override failed";
    } finally {
      submitting.value = false;
    }
  }

  return { submitting, error, approve, override };
}
