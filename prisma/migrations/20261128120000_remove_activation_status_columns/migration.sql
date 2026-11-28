-- Activation is already represented by the boolean active columns.
ALTER TABLE "departments" DROP COLUMN "status";
ALTER TABLE "public_holidays" DROP COLUMN "status";
