<script setup lang="ts">
import { ref } from "vue";
import Button from "./ui/Button.vue";
import Select from "./ui/Select.vue";
import Label from "./ui/Label.vue";
import Card from "./ui/Card.vue";
import { DEPARTMENTS, PRIORITIES } from "@/api/types";
import type { Department, Priority } from "@/api/types";

const props = defineProps<{
  caseId: string;
  submitting: boolean;
}>();
const emit = defineEmits<{
  approve: [caseId: string];
  override: [caseId: string, category: Department, priority?: Priority];
  reject: [caseId: string];
}>();

const mode = ref<"idle" | "override">("idle");
const confirmingClose = ref(false);
const overrideCategory = ref<Department | "">("");
const overridePriority = ref<Priority | "">("");

function submitOverride(): void {
  if (!overrideCategory.value || props.submitting) return;
  emit(
    "override",
    props.caseId,
    overrideCategory.value,
    overridePriority.value || undefined,
  );
}
</script>

<template>
  <Card class="border-amber-300 bg-amber-50 p-3">
    <p class="text-sm font-medium text-amber-900">
      This case needs human review
    </p>
    <p class="mt-0.5 text-xs text-amber-700">
      Classification confidence was below threshold. Approve the LLM classification or
      choose a different routing decision.
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <Button
        :disabled="submitting"
        data-testid="review-approve-button"
        @click="emit('approve', caseId)"
      >
        Approve
      </Button>
      <Button
        variant="outline"
        :disabled="submitting"
        data-testid="review-override-button"
        @click="
          confirmingClose = false;
          mode = mode === 'override' ? 'idle' : 'override';
        "
      >
        Override…
      </Button>
      <Button
        variant="destructive"
        :disabled="submitting"
        data-testid="review-close-button"
        @click="
          mode = 'idle';
          confirmingClose = true;
        "
      >
        Close invalid case
      </Button>
    </div>

    <div
      v-if="confirmingClose"
      class="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5"
      data-testid="review-close-confirmation"
    >
      <p class="text-xs text-red-800">
        Close this case without assigning a specialist? This cannot be retried.
      </p>
      <div class="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          :disabled="submitting"
          data-testid="review-close-confirm"
          @click="emit('reject', caseId)"
        >
          {{ submitting ? "Closing…" : "Confirm close" }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="submitting"
          data-testid="review-close-cancel"
          @click="confirmingClose = false"
        >
          Cancel
        </Button>
      </div>
    </div>

    <div v-if="mode === 'override'" class="mt-3 flex flex-col gap-2">
      <div class="flex flex-col gap-1">
        <Label for="review-override-category">Override category (required)</Label>
        <Select
          id="review-override-category"
          v-model="overrideCategory"
          :options="DEPARTMENTS"
          placeholder="Select department"
          testid="review-category-select"
        />
      </div>
      <div class="flex flex-col gap-1">
        <Label for="review-override-priority">Override priority (optional)</Label>
        <Select
          id="review-override-priority"
          v-model="overridePriority"
          :options="PRIORITIES"
          placeholder="Keep current"
          testid="review-priority-select"
        />
      </div>
      <Button
        :disabled="!overrideCategory || submitting"
        data-testid="review-override-submit"
        @click="submitOverride"
      >
        Submit override
      </Button>
    </div>
  </Card>
</template>
