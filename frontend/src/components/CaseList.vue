<script setup lang="ts">
import Badge from "./ui/Badge.vue";
import ScrollArea from "./ui/ScrollArea.vue";
import type { CaseSummary } from "@/api/types";
import { priorityClasses, statusClasses } from "@/lib/badges";
import { cn, shortId, timeAgo } from "@/lib/utils";

defineProps<{
  cases: CaseSummary[];
  selectedId: string | null;
  loading: boolean;
}>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Cases
    </h2>
    <ScrollArea class="min-h-0 flex-1 pr-1" data-testid="case-list">
      <p
        v-if="!loading && cases.length === 0"
        class="px-1 py-6 text-center text-sm text-slate-400"
        data-testid="case-list-empty"
      >
        No cases yet — submit one to see the pipeline run.
      </p>
      <ul class="flex flex-col gap-1.5">
        <li v-for="c in cases" :key="c.id">
          <button
            type="button"
            :data-testid="`case-list-item-${c.id}`"
            :class="
              cn(
                'w-full rounded-md border p-2 text-left transition-colors',
                selectedId === c.id
                  ? 'border-slate-400 bg-slate-100'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )
            "
            @click="emit('select', c.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-xs text-slate-500">{{ shortId(c.id) }}</span>
              <Badge :class="statusClasses[c.status]">{{ c.status }}</Badge>
            </div>
            <p v-if="c.summary" class="mt-1 line-clamp-2 text-xs text-slate-600">
              {{ c.summary }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge v-if="c.priority" :class="priorityClasses[c.priority]">
                {{ c.priority }}
              </Badge>
              <Badge v-if="c.category">{{ c.category }}</Badge>
              <span v-if="c.confidence !== null" class="text-[11px] text-slate-500">
                conf {{ Math.round(c.confidence * 100) }}%
              </span>
              <span class="ml-auto text-[11px] text-slate-400">
                {{ timeAgo(c.updatedAt) }}
              </span>
            </div>
          </button>
        </li>
      </ul>
    </ScrollArea>
  </div>
</template>
