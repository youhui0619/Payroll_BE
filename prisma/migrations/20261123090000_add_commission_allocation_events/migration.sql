CREATE TABLE "commission_allocation_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_allocation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_allocation_events_companyId_recordId_createdAt_idx" ON "commission_allocation_events"("companyId", "recordId", "createdAt");

ALTER TABLE "commission_allocation_events" ADD CONSTRAINT "commission_allocation_events_companyId_recordId_fkey" FOREIGN KEY ("companyId", "recordId") REFERENCES "commission_payroll_records"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_allocation_events" ADD CONSTRAINT "commission_allocation_events_companyId_runId_fkey" FOREIGN KEY ("companyId", "runId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE commission_allocation_events ADD CONSTRAINT commission_allocation_valid CHECK (action IN ('ALLOCATED', 'RELEASED') AND length(btrim(reason)) > 0);
