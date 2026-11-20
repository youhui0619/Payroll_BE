-- Keep existing employee and work-schedule records compatible with the FE enum.
UPDATE "employees"
SET "employmentType" = UPPER(TRIM("employmentType"))
WHERE "employmentType" IS NOT NULL;

UPDATE "work_schedules"
SET "employmentType" = UPPER(TRIM("employmentType"))
WHERE "employmentType" IS NOT NULL;
