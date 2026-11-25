import { Prisma } from '@prisma/client';
import { OvertimeService } from './overtime.service';

const membership = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: 'employee',
  roles: ['EMPLOYEE'],
  active: true,
} as any;

function database() {
  const db: any = {
    employee: { findFirst: jest.fn() },
    payrollSettings: { findUnique: jest.fn() },
    overtimeRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    storedFile: { findMany: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((callback: (tx: any) => unknown) =>
    callback(db),
  );
  return db;
}

describe('OvertimeService', () => {
  it('calculates duration, break time and configured earning details on create', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      joinedDate: new Date('2026-01-01T00:00:00.000Z'),
      departmentId: 'department',
      managerId: 'manager',
      department: { id: 'department', name: 'Operations' },
    });
    db.payrollSettings.findUnique.mockResolvedValue({
      normalWorkingDayMultiplier: new Prisma.Decimal('1.5'),
      normalWorkingDayEarningCode: 'OT',
    });
    db.overtimeRequest.create.mockImplementation(({ data }: any) => ({
      ...data,
      employee: {
        id: 'employee',
        employeeNo: 'EMP-001',
        name: 'Alex',
        managerId: 'manager',
      },
      department: { id: 'department', code: 'OPS', name: 'Operations' },
      files: [],
    }));

    const result = await new OvertimeService(db).create(membership, {
      requestDate: '2026-10-05',
      overtimeDate: '2026-10-03',
      overtimeType: 'NORMAL_WORKING_DAY',
      startTime: '18:00',
      endTime: '21:00',
      breakDurationMinutes: 30,
      description: 'Month-end report',
    });

    expect(db.overtimeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalMinutes: 180,
          netMinutes: 150,
          earningCode: 'OT',
          hourlyRateMultiplier: expect.any(Prisma.Decimal),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        requestDate: '2026-10-05',
        overtimeDate: '2026-10-03',
        hourlyRateMultiplier: 1.5,
        employee: expect.objectContaining({ name: 'Alex' }),
        department: expect.objectContaining({ name: 'Operations' }),
      }),
    );
    expect(result.data).not.toHaveProperty('employeeName');
    expect(result.data).not.toHaveProperty('departmentName');
  });

  it('enforces the configured minimum overtime duration', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      joinedDate: new Date('2026-01-01T00:00:00.000Z'),
      departmentId: null,
      managerId: null,
      department: null,
    });
    db.payrollSettings.findUnique.mockResolvedValue({
      minimumOvertimeDuration: '60_MINUTES',
      normalWorkingDayMultiplier: new Prisma.Decimal('1.5'),
      normalWorkingDayEarningCode: 'OT',
    });

    await expect(
      new OvertimeService(db).create(membership, {
        requestDate: '2026-10-05',
        overtimeDate: '2026-10-03',
        overtimeType: 'NORMAL_WORKING_DAY',
        startTime: '18:00',
        endTime: '18:45',
        breakDurationMinutes: 0,
        description: 'Short overtime',
      }),
    ).rejects.toMatchObject({ response: { code: 'OVERTIME_BELOW_MINIMUM' } });
  });
});
