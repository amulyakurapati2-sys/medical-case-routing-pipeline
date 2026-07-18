<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    variant?: "default" | "outline" | "ghost" | "destructive";
    size?: "sm" | "md";
    type?: "button" | "submit";
    disabled?: boolean;
  }>(),
  { variant: "default", size: "md", type: "button", disabled: false },
);

const variants: Record<NonNullable<typeof props.variant>, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-700",
  outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  destructive: "bg-red-600 text-white hover:bg-red-500",
};

const sizes: Record<NonNullable<typeof props.size>, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[props.variant],
    sizes[props.size],
  ),
);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
