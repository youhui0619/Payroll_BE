CREATE TABLE "employee_work_schedules" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "scheduleDays" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_work_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_work_schedules_companyId_id_key"
ON "employee_work_schedules"("companyId", "id");

CREATE UNIQUE INDEX "employee_work_schedules_companyId_employeeId_key"
ON "employee_work_schedules"("companyId", "employeeId");

CREATE INDEX "employee_work_schedules_companyId_employeeId_active_idx"
ON "employee_work_schedules"("companyId", "employeeId", "active");

ALTER TABLE "employee_work_schedules"
ADD CONSTRAINT "employee_work_schedules_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_work_schedules"
ADD CONSTRAINT "employee_work_schedules_companyId_employeeId_fkey"
FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
