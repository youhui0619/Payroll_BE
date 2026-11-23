CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "sourceRunId" UUID NOT NULL,
    "targetRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "inputId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "componentCode" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_adjustments_companyId_id_key"
  ON "payroll_adjustments"("companyId", "id");
CREATE UNIQUE INDEX "payroll_adjustments_companyId_targetRunId_idempotencyKey_key"
  ON "payroll_adjustments"("companyId", "targetRunId", "idempotencyKey");
CREATE UNIQUE INDEX "payroll_adjustments_inputId_key"
  ON "payroll_adjustments"("inputId");
CREATE INDEX "payroll_adjustments_companyId_employeeId_sourceRunId_idx"
  ON "payroll_adjustments"("companyId", "employeeId", "sourceRunId");
CREATE INDEX "payroll_adjustments_companyId_targetRunId_createdAt_idx"
  ON "payroll_adjustments"("companyId", "targetRunId", "createdAt");

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_companyId_sourceRunId_fkey"
  FOREIGN KEY ("companyId", "sourceRunId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_companyId_targetRunId_fkey"
  FOREIGN KEY ("companyId", "targetRunId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_companyId_employeeId_fkey"
  FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_inputId_fkey"
  FOREIGN KEY ("inputId") REFERENCES "payroll_inputs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
