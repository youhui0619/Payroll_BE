-- Preserve the legacy annual baseline for fixed policies before removing the duplicate column.
UPDATE "leave_policies"
SET "defaultEntitlement" = "annualDays"
WHERE "defaultEntitlement" IS NULL
  AND "entitlementCalculationMethod" = 'FIXED';

ALTER TABLE "leave_policies" DROP COLUMN "annualDays";
