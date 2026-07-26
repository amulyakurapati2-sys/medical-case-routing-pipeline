<script setup lang="ts">
import { computed, ref } from "vue";
import Badge from "./ui/Badge.vue";
import type { CaseEventVM, SpecialistVM } from "@/api/types";
import {
  confidenceTone,
  priorityClasses,
  sourceClasses,
  statusClasses,
} from "@/lib/badges";
import { timeAgo } from "@/lib/utils";

const props = defineProps<{
  event: CaseEventVM;
  specialistsById: Map<string, SpecialistVM>;
}>();

const expanded = ref(false);

const isTerminalError = computed(
  () => props.event.type === "FAILED" || props.event.type === "UNASSIGNABLE",
);

const specialistName = computed(() => {
  const id = props.event.data.specialistId;
  if (!id) return null;
  const s = props.specialistsById.get(id);
  return s ? `${s.name} · ${s.title}` : id;
});

const confidence = computed(() => {
  const c = props.event.data.confidence;
  return typeof c === "number" ? confidenceTone(c) : null;
});

const formattedFailureCode = computed(() => {
  const code = props.event.data.code;
  return typeof code === "string" ? code.replaceAll("_", " ").toLowerCase() : null;
});
</script>

<template>
  <div
    class="relative border-l-2 pl-4"
    :class="isTerminalError ? 'border-red-300' : 'border-slate-200'"
    :data-testid="`timeline-stage-${event.sequence}`"
  >
    <span
      class="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white"
      :class="isTerminalError ? 'bg-red-400' : 'bg-slate-400'"
    />

    <div class="flex flex-wrap items-center gap-2">
      <Badge :class="statusClasses[event.type]">{{ event.type }}</Badge>
      <Badge :class="sourceClasses[event.source]">{{ event.source }}</Badge>
      <span class="ml-auto text-[11px] text-slate-400">
        #{{ event.sequence }} · {{ timeAgo(event.createdAt) }}
      </span>
    </div>

    <p class="mt-1 text-sm text-slate-800">{{ event.summary }}</p>

    <!-- Guardrail / derived indicators -->
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
      <template v-if="event.type === 'SCRUBBED'">
        <Badge class="bg-cyan-100 text-cyan-700 border-cyan-200">
          {{
            (event.data.redactionCount ?? 0) > 0
              ? `${event.data.redactionCount} pattern(s) scrubbed`
              : "no PHI detected"
          }}
        </Badge>
      </template>

      <template v-if="event.type === 'CLASSIFIED' || event.type === 'NEEDS_REVIEW'">
        <Badge v-if="event.data.category">{{ event.data.category }}</Badge>
        <Badge v-if="event.data.priority" :class="priorityClasses[event.data.priority]">
          {{ event.data.priority }}
        </Badge>
        <span v-if="confidence" class="text-xs font-medium" :class="confidence.classes">
          confidence {{ confidence.label }}
        </span>
        <Badge class="bg-emerald-100 text-emerald-700 border-emerald-200">
          schema validated
        </Badge>
        <Badge class="bg-emerald-100 text-emerald-700 border-emerald-200">grounded</Badge>
      </template>

      <template v-if="event.type === 'ASSIGNED' || event.type === 'REASSIGNED'">
        <Badge
          v-if="specialistName"
          class="bg-emerald-100 text-emerald-700 border-emerald-200"
        >
          {{ specialistName }}
        </Badge>
        <Badge
          v-if="event.data.selectionMethod === 'SINGLE_ELIGIBLE_CANDIDATE'"
          class="border-slate-200 bg-slate-100 text-slate-700"
        >
          deterministic · single candidate
        </Badge>
      </template>

      <template v-if="event.type === 'FAILED'">
        <Badge
          v-if="formattedFailureCode"
          class="border-red-200 bg-red-100 text-red-800"
        >
          {{ formattedFailureCode }}
        </Badge>
      </template>
    </div>

    <p
      v-if="event.type === 'FAILED' && event.data.stage"
      class="mt-1 text-[11px] text-slate-500"
    >
      {{ event.data.stage }}
      <template v-if="event.data.attempts">
        · {{ event.data.attempts }} attempt{{ event.data.attempts === 1 ? "" : "s" }}
      </template>
    </p>

    <p
      v-if="isTerminalError && event.reasoning"
      class="mt-1 text-xs text-red-600"
    >
      {{ event.reasoning }}
    </p>

    <!-- Expandable "why" -->
    <div v-if="event.reasoning && !isTerminalError" class="mt-1">
      <button
        type="button"
        class="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
        :data-testid="`timeline-stage-why-${event.sequence}`"
        @click="expanded = !expanded"
      >
        {{ expanded ? "hide reasoning" : "why?" }}
      </button>
      <p v-if="expanded" class="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">
        {{ event.reasoning }}
      </p>
    </div>
  </div>
</template>
