-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "businessAddressLine1" TEXT,
ADD COLUMN     "businessAddressLine2" TEXT,
ADD COLUMN     "businessCity" TEXT,
ADD COLUMN     "businessCountry" TEXT DEFAULT 'MALAYSIA',
ADD COLUMN     "businessPostcode" TEXT,
ADD COLUMN     "businessState" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "sstNo" TEXT,
ADD COLUMN     "taxNo" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "effectiveFrom" DATE,
ADD COLUMN     "effectiveTo" DATE,
ADD COLUMN     "headOfDepartmentId" UUID,
ADD COLUMN     "parentDepartmentId" UUID,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "bank" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "commissionSettingCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "confirmationDate" DATE,
ADD COLUMN     "contactNo" TEXT,
ADD COLUMN     "contributionCategory" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "eisStatus" TEXT,
ADD COLUMN     "emergencyContactAddressLine1" TEXT,
ADD COLUMN     "emergencyContactAddressLine2" TEXT,
ADD COLUMN     "emergencyContactCity" TEXT,
ADD COLUMN     "emergencyContactCountry" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactNo" TEXT,
ADD COLUMN     "emergencyContactPostcode" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "emergencyContactState" TEXT,
ADD COLUMN     "employmentStatus" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "epfEmployeeNo" TEXT,
ADD COLUMN     "epfEmployerNo" TEXT,
ADD COLUMN     "epfRate" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hrdRegisterNo" TEXT,
ADD COLUMN     "includeOvertime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kwspNo" TEXT,
ADD COLUMN     "leaveEntitlementOverrides" JSONB,
ADD COLUMN     "leavePolicyCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "leaveServiceEntitlementTiers" JSONB,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "medicalLeaveEntitlement" DECIMAL(7,2),
ADD COLUMN     "medicalLeavePeriod" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nricPassportNo" TEXT,
ADD COLUMN     "overtimeCalculationBasis" TEXT,
ADD COLUMN     "overtimeHourlyRate" DECIMAL(14,2),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "race" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "resignationDate" DATE,
ADD COLUMN     "salaryType" TEXT,
ADD COLUMN     "socsoNo" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "statutoryEntitlementCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tin" TEXT;

-- AlterTable
ALTER TABLE "leave_policies" ADD COLUMN     "allowEmployeeSpecificSettings" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "carryForwardPolicy" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "defaultEntitlement" DECIMAL(7,2),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "eligibility" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES',
ADD COLUMN     "entitlementCalculationMethod" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "entitlementGrantMethod" TEXT NOT NULL DEFAULT 'ANNUAL',
ADD COLUMN     "entitlementUnit" TEXT NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "leaveYear" TEXT NOT NULL DEFAULT 'CALENDAR',
ADD COLUMN     "maximumCarryForward" DECIMAL(7,2),
ADD COLUMN     "requireSupportingDocuments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceEntitlementTiers" JSONB;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "approvalWorkflow" TEXT NOT NULL DEFAULT 'ONE_APPROVER',
ADD COLUMN     "automaticallyCalculatePayroll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "blockApprovalOnValidationErrors" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "calculationPrecision" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "configurePublicHolidayRates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "configureRestDayRates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deductionProrationMethod" TEXT NOT NULL DEFAULT 'FOLLOW_SALARY_PRORATION',
ADD COLUMN     "includeBasicSalary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeBonus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeClaimsAndAllowance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeCommissionAndIncentives" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeEis" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeEpf" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeHrdCorpLevy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "includeOvertime" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includePcb" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "includeSocso" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lockAfterFinalApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "normalWorkingDayEarningCode" TEXT NOT NULL DEFAULT 'OT',
ADD COLUMN     "normalWorkingDayMultiplier" DECIMAL(5,2) DEFAULT 1.5,
ADD COLUMN     "notifyApprovers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
ADD COLUMN     "payrollFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "publicHolidayEarningCode" TEXT NOT NULL DEFAULT 'OT-PH',
ADD COLUMN     "publicHolidayOvertimeMultiplier" DECIMAL(5,2) DEFAULT 3.0,
ADD COLUMN     "restDayEarningCode" TEXT NOT NULL DEFAULT 'OT-REST',
ADD COLUMN     "restDayOvertimeMultiplier" DECIMAL(5,2) DEFAULT 2.0,
ADD COLUMN     "salaryProrationMethod" TEXT NOT NULL DEFAULT 'CALENDAR_DAYS',
ADD COLUMN     "scheduledPayDate" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "standardWorkingHoursPerDay" DECIMAL(5,2) DEFAULT 8;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "description" TEXT,
ADD COLUMN     "effectiveFrom" DATE,
ADD COLUMN     "effectiveTo" DATE,
ADD COLUMN     "jobLevel" TEXT,
ADD COLUMN     "reportsTo" TEXT;

-- AlterTable
ALTER TABLE "public_holidays" ADD COLUMN     "description" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'National';

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "leaveRequestId" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fullName" TEXT;

-- AlterTable
ALTER TABLE "work_locations" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'MALAYSIA',
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "scheduleDays" JSONB;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_parentDepartmentId_fkey" FOREIGN KEY ("companyId", "parentDepartmentId") REFERENCES "departments"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_headOfDepartmentId_fkey" FOREIGN KEY ("companyId", "headOfDepartmentId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_companyId_leaveRequestId_fkey" FOREIGN KEY ("companyId", "leaveRequestId") REFERENCES "leave_requests"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
