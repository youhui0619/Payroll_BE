CREATE TABLE "import_batches" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMMITTED',
  "rowCount" INTEGER NOT NULL,
  "createdCount" INTEGER NOT NULL,
  "errorCount" INTEGER NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_batches_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "import_batches_companyId_id_key"
  ON "import_batches"("companyId", "id");
CREATE UNIQUE INDEX "import_batches_companyId_entityType_idempotencyKey_key"
  ON "import_batches"("companyId", "entityType", "idempotencyKey");
CREATE INDEX "import_batches_companyId_entityType_createdAt_idx"
  ON "import_batches"("companyId", "entityType", "createdAt");
