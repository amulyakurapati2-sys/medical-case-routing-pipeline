/**
 * Case list + submission state. The per-case live timeline is handled separately by
 * useCaseStream; this composable keeps the list eventually-fresh via events + a light interval.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { api, ApiError } from "@/api/client";
import type { CaseSummary } from "@/api/types";

const REFRESH_INTERVAL_MS = 5000;

export function useCases() {
  const cases = ref<CaseSummary[]>([]);
  const selectedId = ref<string | null>(null);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);

  const selected = computed(
    () => cases.value.find((c) => c.id === selectedId.value) ?? null,
  );

  async function refresh(): Promise<void> {
    try {
      cases.value = await api.listCases();
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Failed to load cases";
    }
  }

  function select(id: string): void {
    selectedId.value = id;
  }

  async function submit(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    submitting.value = true;
    error.value = null;
    try {
      const { id } = await api.createCase(trimmed);
      await refresh();
      select(id);
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Failed to submit case";
    } finally {
      submitting.value = false;
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(async () => {
    loading.value = true;
    await refresh();
    loading.value = false;
    timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return {
    cases,
    selectedId,
    selected,
    loading,
    submitting,
    error,
    refresh,
    select,
    submit,
  };
}
