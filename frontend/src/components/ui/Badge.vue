<script setup lang="ts">
import { cn } from "@/lib/utils";

// `class` carries the colour tokens (from lib/badges.ts); base styles are fixed here.
defineProps<{ class?: string }>();
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        $props.class ?? 'bg-slate-100 text-slate-700 border-slate-200',
      )
    "
  >
    <slot />
  </span>
</template>
