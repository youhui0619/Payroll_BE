ALTER TABLE "companies"
  ADD COLUMN "llpNo" TEXT;

ALTER TABLE "payroll_settings"
  ADD COLUMN "minimumOvertimeDuration" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "payroll_settings"
  ADD CONSTRAINT "payroll_settings_minimumOvertimeDuration_check"
  CHECK ("minimumOvertimeDuration" IN ('NONE', '15_MINUTES', '30_MINUTES', '60_MINUTES'));
