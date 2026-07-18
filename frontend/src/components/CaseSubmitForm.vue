<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "./ui/Button.vue";
import Textarea from "./ui/Textarea.vue";
import Label from "./ui/Label.vue";

const props = defineProps<{ submitting: boolean; error?: string | null }>();
const emit = defineEmits<{ submit: [text: string] }>();

const text = ref("");

function onSubmit(): void {
  if (!text.value.trim() || props.submitting) return;
  emit("submit", text.value);
}

// Clear the field once a submit completes without error.
watch(
  () => props.submitting,
  (now, was) => {
    if (was && !now && !props.error) text.value = "";
  },
);
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="onSubmit">
    <Label for="case-text">New case (free text)</Label>
    <Textarea
      id="case-text"
      v-model="text"
      :rows="4"
      :disabled="submitting"
      placeholder="Describe the case… e.g. '58yo with chest pain radiating to the left arm, elevated troponin.'"
      data-testid="case-submit-textarea"
    />
    <p v-if="error" class="text-xs text-red-600" data-testid="case-submit-error">
      {{ error }}
    </p>
    <Button
      type="submit"
      :disabled="!text.trim() || submitting"
      data-testid="case-submit-button"
    >
      {{ submitting ? "Submitting…" : "Submit case" }}
    </Button>
  </form>
</template>
