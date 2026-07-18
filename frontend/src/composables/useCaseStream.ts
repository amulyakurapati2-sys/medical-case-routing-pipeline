/**
 * Live single-case timeline (FR-7.5, NFR-3): snapshot-then-subscribe with dedupe-by-sequence and
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
import { api } from "@/api/client";
import type { CaseDetail, CaseEventVM } from "@/api/types";
import { CASE_EVENT_TYPES } from "@/api/types";

export function useCaseStream(selectedId: Ref<string | null>) {
  const eventsMap = ref<Map<number, CaseEventVM>>(new Map());
  const detail = ref<CaseDetail | null>(null);
  const connected = ref(false);

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

  async function loadSnapshot(id: string): Promise<void> {
    const snapshot = await api.getCase(id);
    if (currentId !== id) return; // selection changed while awaiting
    detail.value = snapshot;
    const next = new Map<number, CaseEventVM>();
    for (const e of snapshot.events) next.set(e.sequence, e);
    eventsMap.value = next;
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
  }

  watch(
    selectedId,
    async (id) => {
      teardown();
      currentId = id;
      if (!id) return;
      await loadSnapshot(id);
      if (currentId !== id) return;
      openStream(id);
    },
    { immediate: true },
  );

  onUnmounted(teardown);

  return { events, detail, connected };
}
