CREATE TABLE "overtime_allocation_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_allocation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "overtime_allocation_events_companyId_requestId_createdAt_idx"
  ON "overtime_allocation_events"("companyId", "requestId", "createdAt");

ALTER TABLE "overtime_allocation_events"
  ADD CONSTRAINT "overtime_allocation_events_companyId_requestId_fkey"
  FOREIGN KEY ("companyId", "requestId")
  REFERENCES "overtime_requests"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_allocation_events"
  ADD CONSTRAINT "overtime_allocation_events_companyId_runId_fkey"
  FOREIGN KEY ("companyId", "runId")
  REFERENCES "payroll_runs"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_allocation_events"
  ADD CONSTRAINT "overtime_allocation_valid"
  CHECK ("action" IN ('ALLOCATED', 'RELEASED') AND length(btrim("reason")) > 0);
