<script setup lang="ts">
import Badge from "./ui/Badge.vue";
import Card from "./ui/Card.vue";
import ScrollArea from "./ui/ScrollArea.vue";
import Switch from "./ui/Switch.vue";
import type { SpecialistVM } from "@/api/types";
import { cn } from "@/lib/utils";

defineProps<{
  specialists: SpecialistVM[];
  pendingId: string | null;
  loading: boolean;
  error: string | null;
}>();
const emit = defineEmits<{ "toggle-pto": [id: string, onPto: boolean] }>();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="specialist-panel">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Specialists
    </h2>
    <p
      v-if="error"
      class="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
      role="alert"
      data-testid="specialist-error"
    >
      {{ error }}
    </p>
    <ScrollArea class="min-h-0 flex-1 pr-1">
      <div class="flex flex-col gap-2">
        <Card
          v-for="s in specialists"
          :key="s.id"
          :class="cn('p-3', s.onPto && 'opacity-60')"
          :data-testid="`specialist-card-${s.id}`"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-800">{{ s.name }}</p>
              <p class="truncate text-xs text-slate-500">{{ s.title }}</p>
            </div>
            <Badge>{{ s.department }}</Badge>
          </div>

          <div class="mt-1.5 flex flex-wrap gap-1">
            <Badge
              v-for="e in s.expertise"
              :key="e"
              class="bg-slate-100 text-slate-600 border-slate-200"
            >
              {{ e }}
            </Badge>
          </div>

          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-slate-500">
              load {{ s.currentLoad }}/{{ s.maxCapacity }}
            </span>
            <label class="flex items-center gap-2 text-xs text-slate-600">
              <span>{{ s.onPto ? "On PTO" : "Available" }}</span>
              <Switch
                :model-value="!s.onPto"
                :disabled="pendingId === s.id"
                :testid="`specialist-pto-toggle-${s.id}`"
                @update:model-value="(available) => emit('toggle-pto', s.id, !available)"
              />
            </label>
          </div>
        </Card>
      </div>
    </ScrollArea>
  </div>
</template>
