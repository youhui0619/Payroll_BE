-- AlterTable
ALTER TABLE "public_holidays" ADD COLUMN "code" INTEGER;

-- Backfill existing holidays with a company-scoped business code.
WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId"
      ORDER BY "startDate" ASC, "id" ASC
    ) AS "sequence"
  FROM "public_holidays"
)
UPDATE "public_holidays" AS holiday
SET "code" = numbered."sequence"::INTEGER
FROM numbered
WHERE holiday."id" = numbered."id";

-- Make the generated business code mandatory and unique within a company.
ALTER TABLE "public_holidays" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "public_holidays_companyId_code_key"
ON "public_holidays"("companyId", "code");
