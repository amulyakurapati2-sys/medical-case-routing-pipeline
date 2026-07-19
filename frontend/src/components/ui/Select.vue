<script setup lang="ts" generic="T extends string">
import { cn } from "@/lib/utils";

const model = defineModel<T | "">();
defineProps<{
  id?: string;
  options: readonly T[];
  placeholder?: string;
  disabled?: boolean;
  testid?: string;
  class?: string;
}>();
</script>

<template>
  <select
    :id="id"
    v-model="model"
    :disabled="disabled"
    :data-testid="testid"
    :class="
      cn(
        'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        'disabled:opacity-50',
        $props.class,
      )
    "
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option v-for="opt in options" :key="opt" :value="opt">{{ opt }}</option>
  </select>
</template>
