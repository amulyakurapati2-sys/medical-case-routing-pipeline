<script setup lang="ts">
import { computed } from "vue";
import Badge from "./ui/Badge.vue";
import ScrollArea from "./ui/ScrollArea.vue";
import TimelineStage from "./TimelineStage.vue";
import ReviewPanel from "./ReviewPanel.vue";
import type { CaseDetail, CaseEventVM, Department, Priority, SpecialistVM } from "@/api/types";
import { statusClasses } from "@/lib/badges";
import { shortId } from "@/lib/utils";

const props = defineProps<{
  detail: CaseDetail | null;
  events: CaseEventVM[];
  connected: boolean;
  specialistsById: Map<string, SpecialistVM>;
  reviewSubmitting: boolean;
}>();
const emit = defineEmits<{
  approve: [caseId: string];
  override: [caseId: string, category: Department, priority?: Priority];
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
      Select or submit a case to watch its pipeline in real time.
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
