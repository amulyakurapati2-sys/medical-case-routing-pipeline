<script setup lang="ts">
import { cn } from "@/lib/utils";

defineProps<{ class?: string }>();
</script>

<template>
  <div :class="cn('scrollbar-thin overflow-y-auto', $props.class)">
    <slot />
  </div>
</template>
