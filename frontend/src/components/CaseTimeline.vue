<script setup lang="ts">
import { computed } from "vue";
import Badge from "./ui/Badge.vue";
import ScrollArea from "./ui/ScrollArea.vue";
import TimelineStage from "./TimelineStage.vue";
import ReviewPanel from "./ReviewPanel.vue";
import Button from "./ui/Button.vue";
import type { CaseDetail, CaseEventVM, Department, Priority, SpecialistVM } from "@/api/types";
import { statusClasses } from "@/lib/badges";
import { shortId } from "@/lib/utils";

const props = defineProps<{
  detail: CaseDetail | null;
  events: CaseEventVM[];
  connected: boolean;
  loadError: string | null;
  specialistsById: Map<string, SpecialistVM>;
  reviewSubmitting: boolean;
  actionError: string | null;
}>();
const emit = defineEmits<{
  approve: [caseId: string];
  override: [caseId: string, category: Department, priority?: Priority];
  retry: [caseId: string];
}>();

const assignedName = computed(() => {
  const id = props.detail?.assignedSpecialistId;
  if (!id) return null;
  return props.specialistsById.get(id)?.name ?? null;
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="case-timeline">
    <div
      v-if="!detail"
      class="flex flex-1 items-center justify-center text-sm text-slate-400"
      data-testid="case-timeline-empty"
    >
      <p v-if="loadError" class="text-red-700" role="alert">
        {{ loadError }}
      </p>
      <p v-else>Select or submit a case to watch its pipeline in real time.</p>
    </div>

    <template v-else>
      <div
        class="mb-3 flex flex-wrap items-center gap-2"
        data-testid="case-timeline-header"
      >
        <span class="font-mono text-xs text-slate-500">{{ shortId(detail.id) }}</span>
        <Badge :class="statusClasses[detail.status]">{{ detail.status }}</Badge>
        <span v-if="assignedName" class="text-xs text-slate-600">
          → {{ assignedName }}
        </span>
        <span class="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
          <span
            class="h-2 w-2 rounded-full"
            :class="connected ? 'bg-emerald-400' : 'bg-slate-300'"
            data-testid="case-timeline-connected"
          />
          {{ connected ? "live" : "connecting…" }}
        </span>
      </div>

      <ReviewPanel
        v-if="detail.status === 'NEEDS_REVIEW'"
        class="mb-3"
        :case-id="detail.id"
        :submitting="reviewSubmitting"
        @approve="(id) => emit('approve', id)"
        @override="(id, cat, pri) => emit('override', id, cat, pri)"
      />

      <p
        v-if="loadError"
        class="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
        role="alert"
      >
        {{ loadError }}
      </p>

      <p
        v-if="actionError"
        class="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
        role="alert"
        data-testid="case-action-error"
      >
        {{ actionError }}
      </p>

      <div
        v-if="detail.status === 'UNASSIGNABLE'"
        class="mb-3 rounded-md border border-orange-300 bg-orange-50 p-3"
        data-testid="unassignable-retry-panel"
      >
        <p class="text-sm font-medium text-orange-900">No specialist is currently assigned</p>
        <p class="mt-0.5 text-xs text-orange-700">
          Retry after specialist availability or capacity changes.
        </p>
        <Button
          class="mt-2"
          :disabled="reviewSubmitting"
          data-testid="case-retry-button"
          @click="emit('retry', detail.id)"
        >
          {{ reviewSubmitting ? "Retrying…" : "Retry assignment" }}
        </Button>
      </div>

      <ScrollArea class="min-h-0 flex-1 pr-1">
        <div class="flex flex-col gap-3 py-1">
          <TimelineStage
            v-for="event in events"
            :key="event.sequence"
            :event="event"
            :specialists-by-id="specialistsById"
          />
        </div>
      </ScrollArea>
    </template>
  </div>
</template>
