-- Archive-compatible company financial year month.
ALTER TABLE "companies"
ADD COLUMN "financialStartingMonth" TEXT NOT NULL DEFAULT 'JANUARY';

UPDATE "companies"
SET "financialStartingMonth" = CASE "financialYearStartMonth"
  WHEN 1 THEN 'JANUARY'
  WHEN 2 THEN 'FEBRUARY'
  WHEN 3 THEN 'MARCH'
  WHEN 4 THEN 'APRIL'
  WHEN 5 THEN 'MAY'
  WHEN 6 THEN 'JUNE'
  WHEN 7 THEN 'JULY'
  WHEN 8 THEN 'AUGUST'
  WHEN 9 THEN 'SEPTEMBER'
  WHEN 10 THEN 'OCTOBER'
  WHEN 11 THEN 'NOVEMBER'
  WHEN 12 THEN 'DECEMBER'
  ELSE 'JANUARY'
END;

-- Archive-compatible public holiday regions and status.
ALTER TABLE "public_holidays"
ADD COLUMN "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

UPDATE "public_holidays"
SET "regions" = COALESCE("states", ARRAY[]::TEXT[]),
    "status" = CASE WHEN "active" THEN 'ACTIVE' ELSE 'INACTIVE' END;

-- Daily attendance fields are stored on the existing clock session record.
ALTER TABLE "attendance_sessions"
ADD COLUMN "date" DATE,
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "hoursWorkedMinutes" INTEGER,
ADD COLUMN "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "remark" TEXT;

UPDATE "attendance_sessions"
SET "date" = ("clockIn" AT TIME ZONE companies."timezone")::DATE,
    "durationMinutes" = CASE
      WHEN "clockOut" IS NULL THEN NULL
      ELSE FLOOR(EXTRACT(EPOCH FROM ("clockOut" - "clockIn")) / 60)::INTEGER
    END,
    "hoursWorkedMinutes" = CASE
      WHEN "clockOut" IS NULL THEN NULL
      ELSE FLOOR(EXTRACT(EPOCH FROM ("clockOut" - "clockIn")) / 60)::INTEGER
    END
FROM "companies"
WHERE "attendance_sessions"."companyId" = companies."id";

ALTER TABLE "attendance_sessions"
ALTER COLUMN "date" SET NOT NULL;

CREATE INDEX "attendance_sessions_companyId_employeeId_date_idx"
ON "attendance_sessions"("companyId", "employeeId", "date");

-- Preserve the original request date separately from the creation timestamp.
ALTER TABLE "leave_requests"
ADD COLUMN "requestDate" DATE;

UPDATE "leave_requests"
SET "requestDate" = "createdAt"::DATE;

ALTER TABLE "leave_requests"
ALTER COLUMN "requestDate" SET NOT NULL;

-- Payroll day values support the Archive LAST_DAY sentinel while retaining
-- legacy integer columns for existing backend consumers.
ALTER TABLE "payroll_settings"
ADD COLUMN "payrollCutoffDay" TEXT NOT NULL DEFAULT '25';

UPDATE "payroll_settings"
SET "payrollCutoffDay" = "cutoffDay"::TEXT;

ALTER TABLE "payroll_settings"
ALTER COLUMN "scheduledPayDate" TYPE TEXT
USING "scheduledPayDate"::TEXT;

-- Snapshot the display name because commission settings may later be changed.
ALTER TABLE "commission_payroll_records"
ADD COLUMN "planName" TEXT;

UPDATE "commission_payroll_records" AS records
SET "planName" = settings."name"
FROM "commission_incentive_settings" AS settings
WHERE records."companyId" = settings."companyId"
  AND records."settingId" = settings."id";
