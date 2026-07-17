-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('RECEIVED', 'SCRUBBED', 'CLASSIFIED', 'NEEDS_REVIEW', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "CaseEventType" AS ENUM ('RECEIVED', 'SCRUBBED', 'CLASSIFIED', 'NEEDS_REVIEW', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('CARDIOLOGY', 'NEPHROLOGY', 'ONCOLOGY', 'NEUROLOGY', 'ORTHOPEDICS', 'GENERAL');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('SYSTEM', 'LLM', 'GUARDRAIL', 'HUMAN');

-- CreateTable
CREATE TABLE "specialists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "expertise" TEXT[],
    "profile" TEXT NOT NULL,
    "on_pto" BOOLEAN NOT NULL DEFAULT false,
    "max_capacity" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "scrubbed_text" TEXT NOT NULL DEFAULT '',
    "status" "CaseStatus" NOT NULL DEFAULT 'RECEIVED',
    "category" "Department",
    "priority" "Priority",
    "required_expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "assigned_specialist_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "CaseEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "source" "EventSource" NOT NULL,
    "llm_meta" JSONB,
    "causation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_commands" (
    "command_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "result_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateIndex
CREATE INDEX "cases_assigned_specialist_id_idx" ON "cases"("assigned_specialist_id");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "case_events_case_id_idx" ON "case_events"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_events_case_id_sequence_key" ON "case_events"("case_id", "sequence");

-- CreateIndex
CREATE INDEX "processed_commands_resource_type_resource_id_idx" ON "processed_commands"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_specialist_id_fkey" FOREIGN KEY ("assigned_specialist_id") REFERENCES "specialists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
