-- Allow stored files to belong directly to a company, which is required for company logos.
ALTER TABLE "stored_files" ALTER COLUMN "employeeId" DROP NOT NULL;

ALTER TABLE "stored_files"
ADD CONSTRAINT "stored_files_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
