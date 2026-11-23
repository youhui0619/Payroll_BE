CREATE TABLE "attendance_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "attendanceSessionId" UUID,
    "idempotencyKey" UUID NOT NULL,
    "date" DATE NOT NULL,
    "requestedClockIn" TIMESTAMPTZ(3),
    "requestedClockOut" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_MANAGER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_adjustments_companyId_id_key"
  ON "attendance_adjustments"("companyId", "id");
CREATE UNIQUE INDEX "attendance_adjustments_companyId_idempotencyKey_key"
  ON "attendance_adjustments"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "attendance_sessions_companyId_id_key"
  ON "attendance_sessions"("companyId", "id");
CREATE INDEX "attendance_adjustments_companyId_employeeId_status_date_idx"
  ON "attendance_adjustments"("companyId", "employeeId", "status", "date");
CREATE INDEX "attendance_adjustments_companyId_status_date_idx"
  ON "attendance_adjustments"("companyId", "status", "date");

ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_companyId_employeeId_fkey"
  FOREIGN KEY ("companyId", "employeeId") REFERENCES "employees"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_companyId_attendanceSessionId_fkey"
  FOREIGN KEY ("companyId", "attendanceSessionId") REFERENCES "attendance_sessions"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "attendance_adjustment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_adjustment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_adjustment_events_companyId_adjustmentId_createdAt_idx"
  ON "attendance_adjustment_events"("companyId", "adjustmentId", "createdAt");
ALTER TABLE "attendance_adjustment_events" ADD CONSTRAINT "attendance_adjustment_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustment_events" ADD CONSTRAINT "attendance_adjustment_events_companyId_adjustmentId_fkey"
  FOREIGN KEY ("companyId", "adjustmentId") REFERENCES "attendance_adjustments"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
