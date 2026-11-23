ALTER TABLE "payroll_runs"
  ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

ALTER TABLE "payroll_employees"
  ADD COLUMN "payslipNumber" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "payroll_employees_companyId_payslipNumber_key"
  ON "payroll_employees"("companyId", "payslipNumber")
  WHERE "payslipNumber" IS NOT NULL;
