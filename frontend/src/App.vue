<script setup lang="ts">
import { toRef, watch } from "vue";
import CaseSubmitForm from "./components/CaseSubmitForm.vue";
import CaseList from "./components/CaseList.vue";
import CaseTimeline from "./components/CaseTimeline.vue";
import SpecialistPanel from "./components/SpecialistPanel.vue";
import Card from "./components/ui/Card.vue";
import { useCases } from "./composables/useCases";
import { useCaseStream } from "./composables/useCaseStream";
import { useSpecialists } from "./composables/useSpecialists";
import { useReview } from "./composables/useReview";
import type { Department, Priority } from "@/api/types";

const cases = useCases();
const specialists = useSpecialists();
const stream = useCaseStream(toRef(cases, "selectedId"));
const review = useReview();

// Assignment work continues after the API accepts review, retry, or PTO
// commands. Refresh derived specialist loads when the committed terminal event
// arrives instead of reading them too early from the initial HTTP response.
watch(
  () => {
    const latest = stream.events.value.at(-1);
    return latest
      ? `${cases.selectedId.value}:${latest.sequence}:${latest.type}`
      : null;
  },
  () => {
    const latest = stream.events.value.at(-1);
    if (
      latest &&
      ["ASSIGNED", "REASSIGNED", "UNASSIGNABLE"].includes(latest.type)
    ) {
      void specialists.refresh();
    }
  },
);

async function onApprove(caseId: string): Promise<void> {
  await review.approve(caseId);
  await cases.refresh();
}

async function onOverride(
  caseId: string,
  category: Department,
  priority?: Priority,
): Promise<void> {
  await review.override(caseId, category, priority);
  await cases.refresh();
}

async function onReject(caseId: string): Promise<void> {
  await review.reject(caseId);
  await cases.refresh();
}

async function onRetry(caseId: string): Promise<void> {
  await review.retryAssignment(caseId);
  await cases.refresh();
}
</script>

<template>
  <div class="flex h-full flex-col" data-testid="app-root">
    <!-- Persistent reminder because the public demo must never receive real patient data. -->
    <div
      class="sticky top-0 z-10 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950"
      data-testid="synthetic-data-banner"
    >
      Synthetic demo only — do not enter real patient information.
    </div>

    <header class="border-b border-border bg-white px-4 py-3">
      <h1 class="text-base font-semibold text-slate-800">
        Medical Case Routing Pipeline
      </h1>
      <p class="text-xs text-slate-500">
        Event-routed request pipeline · LLM advises, code decides
      </p>
    </header>

    <main
      class="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[320px_1fr_360px]"
    >
      <!-- Left: submit + case list -->
      <Card class="flex min-h-0 flex-col gap-3 p-3">
        <CaseSubmitForm
          :submitting="cases.submitting.value"
          :error="cases.error.value"
          @submit="cases.submit"
        />
        <CaseList
          :cases="cases.cases.value"
          :selected-id="cases.selectedId.value"
          :loading="cases.loading.value"
          @select="cases.select"
        />
      </Card>

      <!-- Center: live timeline -->
      <Card class="flex min-h-0 flex-col p-3">
        <CaseTimeline
          :detail="stream.detail.value"
          :events="stream.events.value"
          :connected="stream.connected.value"
          :load-error="stream.error.value"
          :specialists-by-id="specialists.byId.value"
          :review-submitting="review.submitting.value"
          :action-error="review.error.value"
          @approve="onApprove"
          @override="onOverride"
          @reject="onReject"
          @retry="onRetry"
        />
      </Card>

      <!-- Right: specialists -->
      <Card class="flex min-h-0 flex-col p-3">
        <SpecialistPanel
          :specialists="specialists.specialists.value"
          :pending-id="specialists.pendingId.value"
          :loading="specialists.loading.value"
          :error="specialists.error.value"
          @toggle-pto="specialists.togglePto"
        />
      </Card>
    </main>
  </div>
</template>
