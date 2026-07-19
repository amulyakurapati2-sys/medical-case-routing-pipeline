/** Specialist list and PTO updates; enabling PTO triggers backend reassignment. */
import { computed, onMounted, ref } from "vue";
import { api, ApiError, newCommandId } from "@/api/client";
import type { SpecialistVM } from "@/api/types";

export function useSpecialists() {
  const specialists = ref<SpecialistVM[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pendingId = ref<string | null>(null);

  const byId = computed(() => {
    const map = new Map<string, SpecialistVM>();
    for (const s of specialists.value) map.set(s.id, s);
    return map;
  });

  async function refresh(): Promise<void> {
    try {
      specialists.value = await api.listSpecialists();
    } catch (err) {
      error.value =
        err instanceof ApiError ? err.message : "Failed to load specialists";
    }
  }

  async function togglePto(id: string, onPto: boolean): Promise<void> {
    pendingId.value = id;
    error.value = null;
    try {
      await api.setPto(id, { commandId: newCommandId(), onPto });
      await refresh(); // pick up derived-load changes
    } catch (err) {
      error.value =
        err instanceof ApiError ? err.message : "Failed to update availability";
    } finally {
      pendingId.value = null;
    }
  }

  onMounted(async () => {
    loading.value = true;
    await refresh();
    loading.value = false;
  });

  return { specialists, byId, loading, error, pendingId, refresh, togglePto };
}
