CREATE TABLE "account_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "employeeId" UUID,
    "kind" TEXT NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_tokens_tokenHash_key" ON "account_tokens"("tokenHash");
CREATE INDEX "account_tokens_companyId_kind_expiresAt_idx" ON "account_tokens"("companyId", "kind", "expiresAt");
CREATE INDEX "account_tokens_companyId_userId_kind_idx" ON "account_tokens"("companyId", "userId", "kind");
CREATE INDEX "account_tokens_companyId_employeeId_kind_idx" ON "account_tokens"("companyId", "employeeId", "kind");

ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_companyId_employeeId_fkey"
  FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_companyId_userId_membership_fkey"
  FOREIGN KEY ("companyId", "userId") REFERENCES "company_memberships"("companyId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_kind_check"
  CHECK ("kind" IN ('INVITE', 'PASSWORD_RESET'));
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_target_check"
  CHECK (
    ("kind" = 'INVITE' AND "employeeId" IS NOT NULL AND "userId" IS NULL)
    OR ("kind" = 'PASSWORD_RESET' AND "userId" IS NOT NULL AND "employeeId" IS NULL)
  );
