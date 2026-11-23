import { Membership, RequestStatus } from '@prisma/client';
import { AttendanceAdjustmentsService } from './attendance-adjustments.service';

const owner = {
  id: 'membership',
  userId: 'owner',
  companyId: 'company',
  employeeId: null,
  roles: ['OWNER'],
} as Membership;

function database() {
  const db: any = {
    employee: { findFirst: jest.fn(), findUnique: jest.fn() },
    payrollRun: { findFirst: jest.fn() },
    attendanceAdjustment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    attendanceAdjustmentEvent: { create: jest.fn() },
    attendanceSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workSchedule: { findFirst: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(db));
  return db;
}

describe('attendance adjustments', () => {
  it('creates an idempotent employee request with the manager workflow status', async () => {
    const db = database();
    const employeeMember = {
      ...owner,
      employeeId: 'employee',
      roles: ['EMPLOYEE'],
    } as Membership;
    db.attendanceAdjustment.findUnique.mockResolvedValue(null);
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      active: true,
      managerId: 'manager',
    });
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.attendanceAdjustment.create.mockResolvedValue({
      id: 'adjustment',
      status: RequestStatus.PENDING_MANAGER,
    });
    const result = await new AttendanceAdjustmentsService(db).create(
      employeeMember,
      {
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        date: '2026-11-24',
        requestedClockIn: '2026-11-24T09:00:00.000Z',
        reason: 'Forgot to clock in',
      },
    );
    expect(result.data.status).toBe(RequestStatus.PENDING_MANAGER);
    expect(db.attendanceAdjustmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: null,
        toStatus: RequestStatus.PENDING_MANAGER,
      }),
    });
  });

  it('moves a manager approval to HR without applying the attendance yet', async () => {
    const db = database();
    const manager = {
      ...owner,
      userId: 'manager-user',
      employeeId: 'manager',
      roles: ['EMPLOYEE'],
    } as Membership;
    db.attendanceAdjustment.findFirst.mockResolvedValue({
      id: 'adjustment',
      companyId: 'company',
      employeeId: 'employee',
      attendanceSessionId: null,
      date: new Date('2026-11-24T00:00:00.000Z'),
      requestedClockIn: new Date('2026-11-24T09:00:00.000Z'),
      requestedClockOut: new Date('2026-11-24T17:00:00.000Z'),
      status: RequestStatus.PENDING_MANAGER,
      employee: { id: 'employee', managerId: 'manager' },
    });
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.attendanceAdjustment.update.mockResolvedValue({
      id: 'adjustment',
      status: RequestStatus.PENDING_HR,
    });
    const result = await new AttendanceAdjustmentsService(db).decide(
      manager,
      'adjustment',
      { decision: 'APPROVE' },
    );
    expect(result.data.status).toBe(RequestStatus.PENDING_HR);
    expect(db.attendanceSession.create).not.toHaveBeenCalled();
  });

  it('applies an HR approval and creates a missing attendance session', async () => {
    const db = database();
    db.attendanceAdjustment.findFirst.mockResolvedValue({
      id: 'adjustment',
      companyId: 'company',
      employeeId: 'employee',
      attendanceSessionId: null,
      date: new Date('2026-11-24T00:00:00.000Z'),
      requestedClockIn: new Date('2026-11-24T09:00:00.000Z'),
      requestedClockOut: new Date('2026-11-24T17:00:00.000Z'),
      status: RequestStatus.PENDING_HR,
      employee: { id: 'employee', managerId: null },
    });
    db.payrollRun.findFirst.mockResolvedValue(null);
    db.employee.findUnique.mockResolvedValue({ scheduleId: null });
    db.attendanceSession.findFirst.mockResolvedValue(null);
    db.attendanceSession.create.mockResolvedValue({ id: 'session' });
    db.attendanceAdjustment.update.mockResolvedValue({
      id: 'adjustment',
      status: RequestStatus.APPROVED,
    });
    const result = await new AttendanceAdjustmentsService(db).decide(
      owner,
      'adjustment',
      { decision: 'APPROVE' },
    );
    expect(result.data.status).toBe(RequestStatus.APPROVED);
    expect(db.attendanceSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee',
        clockInKey: 'ADJUSTMENT:adjustment:IN',
        clockOutKey: 'ADJUSTMENT:adjustment:OUT',
      }),
    });
    expect(db.attendanceAdjustmentEvent.create).toHaveBeenCalled();
  });
});
