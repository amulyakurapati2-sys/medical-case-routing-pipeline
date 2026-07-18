<script setup lang="ts">
import { cn } from "@/lib/utils";

const model = defineModel<string>();
defineProps<{ placeholder?: string; disabled?: boolean; rows?: number; class?: string }>();
</script>

<template>
  <textarea
    v-model="model"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows ?? 4"
    :class="
      cn(
        'w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        'disabled:opacity-50',
        $props.class,
      )
    "
  />
</template>
