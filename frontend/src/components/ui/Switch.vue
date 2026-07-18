<script setup lang="ts">
import { cn } from "@/lib/utils";

const model = defineModel<boolean>({ default: false });
const props = defineProps<{ disabled?: boolean; testid?: string }>();

function toggle(): void {
  if (props.disabled) return;
  model.value = !model.value;
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :disabled="disabled"
    :data-testid="testid"
    :class="
      cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        'disabled:opacity-50',
        model ? 'bg-slate-900' : 'bg-slate-300',
      )
    "
    @click="toggle"
  >
    <span
      :class="
        cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          model ? 'translate-x-4' : 'translate-x-1',
        )
      "
    />
  </button>
</template>
