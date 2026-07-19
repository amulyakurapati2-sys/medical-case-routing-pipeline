/**
 * Live single-case timeline: snapshot-then-subscribe with dedupe-by-sequence and
 * gap-closing refetch on reconnect. Exactly one EventSource is open at a time — for the selected case.
 *
 * Flow when the selection changes:
 *   1. tear down any previous stream + state
 *   2. GET /cases/:id snapshot (authoritative initial timeline) -> seed map keyed by sequence
 *   3. open EventSource; every event merges into the same map (duplicates by sequence ignored)
 *   4. on error/reconnect the browser resends Last-Event-ID automatically; we also refetch the
 *      snapshot once to guarantee no gap, then keep merging.
 */
import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { api, ApiError } from "@/api/client";
import type { CaseDetail, CaseEventVM } from "@/api/types";
import { CASE_EVENT_TYPES } from "@/api/types";

export function useCaseStream(selectedId: Ref<string | null>) {
  const eventsMap = ref<Map<number, CaseEventVM>>(new Map());
  const detail = ref<CaseDetail | null>(null);
  const connected = ref(false);
  const error = ref<string | null>(null);

  let source: EventSource | null = null;
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;
  let currentId: string | null = null;

  const events = computed(() =>
    [...eventsMap.value.values()].sort((a, b) => a.sequence - b.sequence),
  );

  function merge(event: CaseEventVM): void {
    if (eventsMap.value.has(event.sequence)) return; // dedupe by sequence
    eventsMap.value.set(event.sequence, event);
    // trigger reactivity for the computed (Map mutation isn't tracked deeply)
    eventsMap.value = new Map(eventsMap.value);
    projectStatus(event);
  }

  /** Keep the header/status (and review-control visibility) current as events arrive. */
  function projectStatus(event: CaseEventVM): void {
    if (!detail.value) return;
    detail.value.status = event.type;
    if (event.data.category) detail.value.category = event.data.category;
    if (event.data.priority) detail.value.priority = event.data.priority;
    if (typeof event.data.confidence === "number")
      detail.value.confidence = event.data.confidence;
    if (event.type === "UNASSIGNABLE" || event.type === "FAILED") {
      detail.value.assignedSpecialistId = null;
    } else if (event.data.specialistId) {
      detail.value.assignedSpecialistId = event.data.specialistId;
    }
  }

  async function loadSnapshot(id: string): Promise<boolean> {
    try {
      const snapshot = await api.getCase(id);
      if (currentId !== id) return false; // selection changed while awaiting
      detail.value = snapshot;
      const next = new Map<number, CaseEventVM>();
      for (const e of snapshot.events) next.set(e.sequence, e);
      eventsMap.value = next;
      error.value = null;
      return true;
    } catch (err) {
      if (currentId === id) {
        error.value = err instanceof ApiError ? err.message : "Failed to load case";
      }
      return false;
    }
  }

  function openStream(id: string): void {
    source = new EventSource(api.streamUrl(id));
    for (const type of CASE_EVENT_TYPES) {
      source.addEventListener(type, (ev) => {
        try {
          merge(JSON.parse((ev as MessageEvent).data) as CaseEventVM);
        } catch {
          /* ignore malformed frame */
        }
      });
    }
    source.onopen = () => {
      connected.value = true;
    };
    source.onerror = () => {
      connected.value = false;
      // Debounced gap-closing refetch; EventSource itself keeps retrying + resends Last-Event-ID.
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        if (currentId) void loadSnapshot(currentId);
      }, 1500);
    };
  }

  function teardown(): void {
    if (refetchTimer) clearTimeout(refetchTimer);
    source?.close();
    source = null;
    connected.value = false;
    eventsMap.value = new Map();
    detail.value = null;
    error.value = null;
  }

  watch(
    selectedId,
    async (id) => {
      teardown();
      currentId = id;
      if (!id) return;
      const loaded = await loadSnapshot(id);
      if (currentId !== id) return;
      if (!loaded) return;
      openStream(id);
    },
    { immediate: true },
  );

  onUnmounted(teardown);

  return { events, detail, connected, error };
}
