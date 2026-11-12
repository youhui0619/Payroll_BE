-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "overtimeRequestId" UUID;

-- CreateTable
CREATE TABLE "payslip_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "pageSize" TEXT NOT NULL DEFAULT 'A4',
    "pageOrientation" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "payslipNumberFormat" TEXT NOT NULL DEFAULT 'PAY-{YYYY}-{MM}-{EMPLOYEE_ID}',
    "pdfFilenameFormat" TEXT NOT NULL DEFAULT '{EMPLOYEE_ID}-{YYYY}-{MM}-payslip',
    "passwordProtectedPdf" BOOLEAN NOT NULL DEFAULT false,
    "companyLogo" BOOLEAN NOT NULL DEFAULT true,
    "employeeDetails" BOOLEAN NOT NULL DEFAULT true,
    "departmentAndPosition" BOOLEAN NOT NULL DEFAULT true,
    "employmentType" BOOLEAN NOT NULL DEFAULT false,
    "payPeriodAndPaymentDate" BOOLEAN NOT NULL DEFAULT true,
    "salaryAndEarnings" BOOLEAN NOT NULL DEFAULT true,
    "itemizedDeductions" BOOLEAN NOT NULL DEFAULT true,
    "employerContributions" BOOLEAN NOT NULL DEFAULT true,
    "yearToDateTotals" BOOLEAN NOT NULL DEFAULT true,
    "leaveBalance" BOOLEAN NOT NULL DEFAULT true,
    "employeeExpensesList" BOOLEAN NOT NULL DEFAULT true,
    "dailyAttendanceRecord" BOOLEAN NOT NULL DEFAULT true,
    "leaveList" BOOLEAN NOT NULL DEFAULT true,
    "bankAccountDetails" BOOLEAN NOT NULL DEFAULT false,
    "maskBankAccountNumber" BOOLEAN NOT NULL DEFAULT true,
    "displayFooterMessage" BOOLEAN NOT NULL DEFAULT false,
    "footerText" TEXT NOT NULL DEFAULT '',
    "publishingMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "employeeVisibility" TEXT NOT NULL DEFAULT 'EMPLOYEES_AND_ADMINS',
    "notifyEmployees" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payslip_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "departmentId" UUID,
    "requestDate" DATE NOT NULL,
    "overtimeDate" DATE NOT NULL,
    "overtimeType" TEXT NOT NULL DEFAULT 'NORMAL_WORKING_DAY',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 0,
    "netMinutes" INTEGER NOT NULL,
    "hourlyRateMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "earningCode" TEXT NOT NULL DEFAULT 'OT',
    "description" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "decisionComment" TEXT,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "payrollRunId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_incentive_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commissionType" TEXT NOT NULL,
    "calculationMethod" TEXT NOT NULL,
    "rate" DECIMAL(7,4),
    "amount" DECIMAL(14,2),
    "calculationFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "payoutTiming" TEXT NOT NULL DEFAULT 'CURRENT_PAYROLL',
    "description" TEXT,
    "eligibleEmployees" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES',
    "eligibleDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligiblePositionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligibleEmployeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payrollEarningCode" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_incentive_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payroll_records" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "settingId" UUID,
    "planCode" TEXT NOT NULL,
    "payrollEarningCode" TEXT NOT NULL,
    "calculationMethod" TEXT,
    "calculationFrequency" TEXT,
    "payoutTiming" TEXT,
    "calculationBasis" DECIMAL(14,2),
    "rate" DECIMAL(7,4),
    "amount" DECIMAL(14,2) NOT NULL,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "approvalComment" TEXT,
    "payrollRunId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "whatsappNotifications" BOOLEAN NOT NULL DEFAULT false,
    "leaveApplications" BOOLEAN NOT NULL DEFAULT true,
    "claims" BOOLEAN NOT NULL DEFAULT true,
    "attendanceOvertime" BOOLEAN NOT NULL DEFAULT true,
    "payrollPayslips" BOOLEAN NOT NULL DEFAULT true,
    "statutoryCompliance" BOOLEAN NOT NULL DEFAULT true,
    "probationConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "probationConfirmationLeadMonths" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regional_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "numberFormat" TEXT NOT NULL DEFAULT '1,234.56',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regional_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payslip_settings_companyId_key" ON "payslip_settings"("companyId");

-- CreateIndex
CREATE INDEX "overtime_requests_companyId_employeeId_overtimeDate_idx" ON "overtime_requests"("companyId", "employeeId", "overtimeDate");

-- CreateIndex
CREATE INDEX "overtime_requests_companyId_status_idx" ON "overtime_requests"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_companyId_id_key" ON "overtime_requests"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_incentive_settings_companyId_id_key" ON "commission_incentive_settings"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_incentive_settings_companyId_code_key" ON "commission_incentive_settings"("companyId", "code");

-- CreateIndex
CREATE INDEX "commission_payroll_records_companyId_employeeId_status_idx" ON "commission_payroll_records"("companyId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "commission_payroll_records_companyId_payrollRunId_idx" ON "commission_payroll_records"("companyId", "payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payroll_records_companyId_id_key" ON "commission_payroll_records"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_companyId_key" ON "notification_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "regional_settings_companyId_key" ON "regional_settings"("companyId");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_companyId_overtimeRequestId_fkey" FOREIGN KEY ("companyId", "overtimeRequestId") REFERENCES "overtime_requests"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_settings" ADD CONSTRAINT "payslip_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "departments"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_payrollRunId_fkey" FOREIGN KEY ("companyId", "payrollRunId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_incentive_settings" ADD CONSTRAINT "commission_incentive_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payroll_records" ADD CONSTRAINT "commission_payroll_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payroll_records" ADD CONSTRAINT "commission_payroll_records_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payroll_records" ADD CONSTRAINT "commission_payroll_records_companyId_settingId_fkey" FOREIGN KEY ("companyId", "settingId") REFERENCES "commission_incentive_settings"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payroll_records" ADD CONSTRAINT "commission_payroll_records_companyId_payrollRunId_fkey" FOREIGN KEY ("companyId", "payrollRunId") REFERENCES "payroll_runs"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regional_settings" ADD CONSTRAINT "regional_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
