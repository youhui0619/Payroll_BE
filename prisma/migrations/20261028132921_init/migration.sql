-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'HR', 'FINANCE', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING_MANAGER', 'PENDING_HR', 'PENDING_FINANCE', 'APPROVED', 'REJECTED', 'CANCELLED', 'PAID');

-- CreateEnum
CREATE TYPE "LeaveApproval" AS ENUM ('MANAGER', 'MANAGER_HR', 'HR_ONLY', 'NO_APPROVAL');

-- CreateEnum
CREATE TYPE "StatutoryScheme" AS ENUM ('EPF', 'SOCSO', 'EIS', 'LINDUNG_24_JAM', 'PCB', 'HRD');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PUBLISHED', 'PAID');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "currency" CHAR(3) NOT NULL DEFAULT 'MYR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "registrationNo" TEXT,
    "email" TEXT,
    "contactNo" TEXT,
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID,
    "roles" "Role"[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "joinedDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" UUID,
    "positionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "managerId" UUID,
    "locationId" UUID,
    "scheduleId" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_locations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workingDays" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "states" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "clockIn" TIMESTAMPTZ(3) NOT NULL,
    "clockOut" TIMESTAMPTZ(3),
    "clockInKey" TEXT NOT NULL,
    "clockOutKey" TEXT,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "annualDays" DECIMAL(7,2) NOT NULL,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "noticeDays" INTEGER NOT NULL DEFAULT 0,
    "approval" "LeaveApproval" NOT NULL DEFAULT 'HR_ONLY',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(7,2) NOT NULL,
    "daySnapshot" JSONB,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "managerId" UUID,
    "approval" "LeaveApproval" NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "decisionComment" TEXT,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "requestId" UUID,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(7,2) NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "receiptRequired" BOOLEAN NOT NULL DEFAULT false,
    "maxAmount" DECIMAL(14,2),
    "effectiveFrom" DATE,
    "effectiveTo" DATE,

    CONSTRAINT "claim_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "payrollRunId" UUID,
    "payrollComponentCode" TEXT,
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "typeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "managerId" UUID,
    "paymentMethod" TEXT NOT NULL,
    "paymentDate" DATE,
    "paymentReference" TEXT,
    "decisionComment" TEXT,
    "decidedBy" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "claimId" UUID,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'UNSCANNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_rulesets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "scheme" "StatutoryScheme" NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceUrl" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_profiles" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "epfCategory" TEXT NOT NULL,
    "socsoCategory" TEXT NOT NULL,
    "eisCategory" TEXT NOT NULL,
    "lindungCategory" TEXT NOT NULL,
    "pcbCategory" TEXT NOT NULL,
    "hrdCategory" TEXT NOT NULL,
    "taxInputs" JSONB NOT NULL,

    CONSTRAINT "employee_payroll_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_profile_versions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "epfCategory" TEXT NOT NULL,
    "socsoCategory" TEXT NOT NULL,
    "eisCategory" TEXT NOT NULL,
    "lindungCategory" TEXT NOT NULL,
    "pcbCategory" TEXT NOT NULL,
    "hrdCategory" TEXT NOT NULL,
    "lindungParticipation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_payroll_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_expenses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "amounts" JSONB NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_tax_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_families" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "declaration" JSONB NOT NULL,
    "reliefs" JSONB NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_tax_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_openings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "taxableIncome" DECIMAL(14,2) NOT NULL,
    "employeeEpf" DECIMAL(14,2) NOT NULL,
    "mtd" DECIMAL(14,2) NOT NULL,
    "zakat" DECIMAL(14,2) NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_tax_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "cutoffDay" INTEGER NOT NULL DEFAULT 25,
    "payDay" INTEGER NOT NULL DEFAULT 28,
    "currency" CHAR(3) NOT NULL DEFAULT 'MYR',
    "makerChecker" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_component_definitions" (
    "pcbTreatment" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "active" BOOLEAN NOT NULL,
    "affectsGross" BOOLEAN NOT NULL,
    "affectsNet" BOOLEAN NOT NULL,
    "statutoryBases" "StatutoryScheme"[],
    "reason" TEXT NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_component_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_inputs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "componentCode" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedBy" UUID,
    "voidReason" TEXT,

    CONSTRAINT "payroll_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "employerContributions" DECIMAL(14,2) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "payroll_employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_companyId_userId_key" ON "company_memberships"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_companyId_employeeId_key" ON "company_memberships"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_id_key" ON "employees"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_employeeNo_key" ON "employees"("companyId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_id_key" ON "departments"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_companyId_code_key" ON "departments"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_companyId_id_key" ON "positions"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_companyId_code_key" ON "positions"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "salary_history_companyId_employeeId_effectiveFrom_key" ON "salary_history"("companyId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_companyId_id_key" ON "work_locations"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_companyId_code_key" ON "work_locations"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_companyId_id_key" ON "work_schedules"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_companyId_code_key" ON "work_schedules"("companyId", "code");

-- CreateIndex
CREATE INDEX "public_holidays_companyId_startDate_endDate_idx" ON "public_holidays"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "audit_events_companyId_createdAt_idx" ON "audit_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_sessions_companyId_employeeId_clockIn_idx" ON "attendance_sessions"("companyId", "employeeId", "clockIn");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_companyId_employeeId_clockInKey_key" ON "attendance_sessions"("companyId", "employeeId", "clockInKey");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_companyId_employeeId_clockOutKey_key" ON "attendance_sessions"("companyId", "employeeId", "clockOutKey");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_companyId_id_key" ON "leave_policies"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_companyId_code_key" ON "leave_policies"("companyId", "code");

-- CreateIndex
CREATE INDEX "leave_requests_companyId_employeeId_startDate_endDate_idx" ON "leave_requests"("companyId", "employeeId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_companyId_id_key" ON "leave_requests"("companyId", "id");

-- CreateIndex
CREATE INDEX "leave_events_companyId_requestId_createdAt_idx" ON "leave_events"("companyId", "requestId", "createdAt");

-- CreateIndex
CREATE INDEX "leave_ledger_companyId_employeeId_policyId_year_idx" ON "leave_ledger"("companyId", "employeeId", "policyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_ledger_companyId_idempotencyKey_key" ON "leave_ledger"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "claim_types_companyId_id_key" ON "claim_types"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "claim_types_companyId_code_key" ON "claim_types"("companyId", "code");

-- CreateIndex
CREATE INDEX "claims_companyId_employeeId_status_idx" ON "claims"("companyId", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "claims_companyId_id_key" ON "claims"("companyId", "id");

-- CreateIndex
CREATE INDEX "claim_events_companyId_claimId_createdAt_idx" ON "claim_events"("companyId", "claimId", "createdAt");

-- CreateIndex
CREATE INDEX "stored_files_companyId_employeeId_category_idx" ON "stored_files"("companyId", "employeeId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_companyId_id_key" ON "stored_files"("companyId", "id");

-- CreateIndex
CREATE INDEX "statutory_rulesets_companyId_scheme_category_effectiveFrom_idx" ON "statutory_rulesets"("companyId", "scheme", "category", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_rulesets_companyId_id_key" ON "statutory_rulesets"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_rulesets_companyId_scheme_category_version_key" ON "statutory_rulesets"("companyId", "scheme", "category", "version");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_profiles_companyId_employeeId_key" ON "employee_payroll_profiles"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_payroll_profile_versions_companyId_employeeId_effe_idx" ON "employee_payroll_profile_versions"("companyId", "employeeId", "effectiveFrom", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_profile_versions_companyId_employeeId_revi_key" ON "employee_payroll_profile_versions"("companyId", "employeeId", "revision");

-- CreateIndex
CREATE INDEX "employee_tax_expenses_companyId_employeeId_year_effectiveMo_idx" ON "employee_tax_expenses"("companyId", "employeeId", "year", "effectiveMonth", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_expenses_companyId_employeeId_year_revision_key" ON "employee_tax_expenses"("companyId", "employeeId", "year", "revision");

-- CreateIndex
CREATE INDEX "employee_tax_families_companyId_employeeId_year_effectiveMo_idx" ON "employee_tax_families"("companyId", "employeeId", "year", "effectiveMonth", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_families_companyId_employeeId_year_revision_key" ON "employee_tax_families"("companyId", "employeeId", "year", "revision");

-- CreateIndex
CREATE INDEX "employee_tax_openings_companyId_employeeId_year_effectiveMo_idx" ON "employee_tax_openings"("companyId", "employeeId", "year", "effectiveMonth", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_openings_companyId_employeeId_year_revision_key" ON "employee_tax_openings"("companyId", "employeeId", "year", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_companyId_key" ON "payroll_settings"("companyId");

-- CreateIndex
CREATE INDEX "payroll_component_definitions_companyId_code_effectiveFrom__idx" ON "payroll_component_definitions"("companyId", "code", "effectiveFrom", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_component_definitions_companyId_code_revision_key" ON "payroll_component_definitions"("companyId", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_companyId_id_key" ON "payroll_runs"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_companyId_year_month_key" ON "payroll_runs"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_inputs_companyId_runId_employeeId_idx" ON "payroll_inputs"("companyId", "runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_inputs_companyId_runId_idempotencyKey_key" ON "payroll_inputs"("companyId", "runId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employees_companyId_runId_employeeId_key" ON "payroll_employees"("companyId", "runId", "employeeId");

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "departments"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_positionId_fkey" FOREIGN KEY ("companyId", "positionId") REFERENCES "positions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_managerId_fkey" FOREIGN KEY ("companyId", "managerId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "work_locations"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_scheduleId_fkey" FOREIGN KEY ("companyId", "scheduleId") REFERENCES "work_schedules"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "departments"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_policyId_fkey" FOREIGN KEY ("companyId", "policyId") REFERENCES "leave_policies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_companyId_requestId_fkey" FOREIGN KEY ("companyId", "requestId") REFERENCES "leave_requests"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_companyId_policyId_fkey" FOREIGN KEY ("companyId", "policyId") REFERENCES "leave_policies"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_companyId_requestId_fkey" FOREIGN KEY ("companyId", "requestId") REFERENCES "leave_requests"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_types" ADD CONSTRAINT "claim_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_companyId_payrollRunId_fkey" FOREIGN KEY ("companyId", "payrollRunId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "claim_types"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_companyId_claimId_fkey" FOREIGN KEY ("companyId", "claimId") REFERENCES "claims"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_companyId_claimId_fkey" FOREIGN KEY ("companyId", "claimId") REFERENCES "claims"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_rulesets" ADD CONSTRAINT "statutory_rulesets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_profile_versions" ADD CONSTRAINT "employee_payroll_profile_versions_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_expenses" ADD CONSTRAINT "employee_tax_expenses_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_families" ADD CONSTRAINT "employee_tax_families_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_openings" ADD CONSTRAINT "employee_tax_openings_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_component_definitions" ADD CONSTRAINT "payroll_component_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_companyId_runId_fkey" FOREIGN KEY ("companyId", "runId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_employees_companyId_runId_fkey" FOREIGN KEY ("companyId", "runId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_employees_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional database invariants (not expressible in Prisma schema).
ALTER TABLE "payroll_component_definitions" ADD CONSTRAINT "component_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "payroll_component_definitions" ADD CONSTRAINT "component_month_boundary" CHECK (EXTRACT(DAY FROM "effectiveFrom") = 1);
ALTER TABLE "payroll_component_definitions" ADD CONSTRAINT "component_valid_kind" CHECK ("kind" IN ('EARNING', 'DEDUCTION'));
ALTER TABLE "payroll_component_definitions" ADD CONSTRAINT "component_has_effect" CHECK ("affectsGross" OR "affectsNet" OR cardinality("statutoryBases") > 0);
ALTER TABLE "employee_payroll_profile_versions" ADD CONSTRAINT "payroll_profile_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "employee_payroll_profile_versions" ADD CONSTRAINT "payroll_profile_month_boundary" CHECK (EXTRACT(DAY FROM "effectiveFrom") = 1);
ALTER TABLE "employee_payroll_profile_versions" ADD CONSTRAINT "payroll_profile_participation" CHECK ("lindungParticipation" IN ('ENROLLED', 'OPTED_OUT', 'MANDATORY', 'NOT_ELIGIBLE'));
CREATE UNIQUE INDEX "attendance_one_open_session" ON "attendance_sessions" ("companyId", "employeeId") WHERE "clockOut" IS NULL;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_valid_times" CHECK ("clockOut" IS NULL OR "clockOut" >= "clockIn");
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_valid_dates" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "claims" ADD CONSTRAINT "claim_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "company_memberships" ADD CONSTRAINT "membership_has_role" CHECK (cardinality("roles") > 0);
ALTER TABLE "claim_types" ADD CONSTRAINT "claim_type_positive_limit" CHECK ("maxAmount" IS NULL OR "maxAmount" > 0);
ALTER TABLE "claim_types" ADD CONSTRAINT "claim_type_valid_dates" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");




ALTER TABLE payroll_inputs ADD CONSTRAINT payroll_inputs_positive_amount CHECK (amount > 0);
ALTER TABLE payroll_inputs ADD CONSTRAINT payroll_inputs_void_consistency CHECK (("voidedAt" IS NULL AND "voidedBy" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason")) > 0));


ALTER TABLE claims ADD CONSTRAINT claims_payroll_allocation_pair CHECK (("payrollRunId" IS NULL AND "payrollComponentCode" IS NULL) OR ("payrollRunId" IS NOT NULL AND "payrollComponentCode" IS NOT NULL AND "paymentMethod" = 'PAYROLL'));

ALTER TABLE payroll_component_definitions ADD CONSTRAINT component_pcb_treatment CHECK ((('PCB'::"StatutoryScheme" = ANY("statutoryBases")) AND "pcbTreatment" IN ('NORMAL', 'ADDITIONAL')) OR ((NOT ('PCB'::"StatutoryScheme" = ANY("statutoryBases"))) AND "pcbTreatment" IN ('EXCLUDED', 'EXCLUDED_NORMAL', 'EXCLUDED_ADDITIONAL', 'UNCLASSIFIED')));

ALTER TABLE employee_tax_openings ADD CONSTRAINT tax_opening_valid_values CHECK (year BETWEEN 2000 AND 2200 AND "effectiveMonth" BETWEEN 1 AND 12 AND revision > 0 AND "taxableIncome" >= 0 AND "employeeEpf" >= 0 AND mtd >= 0 AND zakat >= 0);

ALTER TABLE employee_tax_families ADD CONSTRAINT tax_family_valid_period CHECK (year = 2026 AND "effectiveMonth" BETWEEN 1 AND 12 AND revision > 0);

ALTER TABLE employee_tax_expenses ADD CONSTRAINT tax_expense_valid_period CHECK (year = 2026 AND "effectiveMonth" BETWEEN 1 AND 12 AND revision > 0);

