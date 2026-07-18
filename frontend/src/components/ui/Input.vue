<script setup lang="ts">
import { cn } from "@/lib/utils";

const model = defineModel<string>();
defineProps<{ placeholder?: string; disabled?: boolean; class?: string }>();
</script>

<template>
  <input
    v-model="model"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="
      cn(
        'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        'disabled:opacity-50',
        $props.class,
      )
    "
  />
</template>
