import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService, workingDays } from '../leave/leave.service';
import { ClaimsService } from '../claims/claims.service';
import { Membership, Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
const member = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: 'employee',
  roles: ['EMPLOYEE'],
  active: true,
} as Membership;
function database() {
  const tx: any = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'employee',
        joinedDate: new Date('2026-01-01'),
      }),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ timezone: 'Asia/Kuala_Lumpur' }),
    },
    attendanceSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leaveRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
    overtimeRequest: { findMany: jest.fn() },
    publicHoliday: { findMany: jest.fn() },
    leaveLedger: {
      aggregate: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    leavePolicy: { findMany: jest.fn() },
    payrollRun: { count: jest.fn().mockResolvedValue(0) },
    leaveEvent: { create: jest.fn() },
    claim: { findUnique: jest.fn(), update: jest.fn() },
    claimEvent: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  tx.$transaction.mockImplementation((input) =>
    Array.isArray(input) ? Promise.all(input) : input(tx),
  );
  return tx;
}
describe('work calendar', () => {
  it('excludes weekends and holiday ranges', () => {
    expect(
      workingDays(
        new Date('2026-11-02'),
        new Date('2026-11-08'),
        [1, 2, 3, 4, 5],
        [
          {
            startDate: new Date('2026-11-04'),
            endDate: new Date('2026-11-05'),
          },
        ],
      ),
    ).toBe(3);
  });
  it('supports non-Monday work weeks', () => {
    expect(
      workingDays(
        new Date('2026-11-01'),
        new Date('2026-11-07'),
        [0, 1, 2, 3, 4],
        [],
      ),
    ).toBe(5);
  });
});
describe('clocking', () => {
  it('replays a matching idempotency key without creating another event', async () => {
    const db = database();
    db.attendanceSession.findFirst.mockResolvedValueOnce({ id: 'old' });
    expect(await new AttendanceService(db).clock(member, 'key', 'IN')).toEqual({
      data: { id: 'old' },
    });
    expect(db.attendanceSession.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate clock in', async () => {
    const db = database();
    db.attendanceSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'open' });
    await expect(
      new AttendanceService(db).clock(member, 'key', 'IN'),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_CLOCKED_IN' } });
  });
  it('rejects clock out without a session', async () => {
    const db = database();
    db.attendanceSession.findFirst.mockResolvedValue(null);
    await expect(
      new AttendanceService(db).clock(member, 'key', 'OUT'),
    ).rejects.toMatchObject({ response: { code: 'NOT_CLOCKED_IN' } });
  });
  it('uses server timestamps and tenant scope', async () => {
    const db = database();
    db.attendanceSession.findFirst.mockResolvedValue(null);
    db.attendanceSession.create.mockResolvedValue({ id: 'new' });
    await new AttendanceService(db).clock(member, 'key', 'IN');
    expect(db.attendanceSession.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        employeeId: 'employee',
        date: expect.any(Date),
        clockIn: expect.any(Date),
        clockInKey: 'key',
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});

describe('employee attendance calendar', () => {
  it('returns one employee calendar for the requested month', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({ id: 'employee', active: true });
    db.employee.findMany.mockResolvedValue([
      {
        id: 'employee',
        employeeNo: 'EMP-001',
        name: 'Alex',
        departmentId: 'department',
        department: { id: 'department', code: 'OPS', name: 'Operations' },
      },
    ]);
    db.attendanceSession.findMany.mockResolvedValue([]);
    db.leaveRequest.findMany.mockResolvedValue([]);
    db.overtimeRequest.findMany.mockResolvedValue([]);
    db.publicHoliday.findMany.mockResolvedValue([]);

    const result = await new AttendanceService(db).employeeCalendar(
      member,
      'employee',
      { year: 2026, month: 11 } as any,
    );

    expect(db.employee.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company', id: 'employee', active: true },
    });
    expect(db.employee.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company', id: 'employee' },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        departmentId: true,
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
      take: 501,
    });
    expect(result.data).toMatchObject({
      year: 2026,
      month: 11,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(result.data.employees).toHaveLength(1);
    expect(result.data.employees[0]).toMatchObject({
      employeeId: 'employee',
      employeeNo: 'EMP-001',
      days: expect.any(Array),
      summary: {
        presentDays: 0,
        leaveDays: 0,
        overtimeMinutes: 0,
        workedMinutes: 0,
      },
    });
    expect(result.data.employees[0].days).toHaveLength(30);
  });
});
const leave = {
  id: 'leave',
  companyId: 'company',
  employeeId: 'employee',
  policyId: 'policy',
  status: 'PENDING_HR',
  days: new Prisma.Decimal(2),
  startDate: new Date('2099-01-01'),
  endDate: new Date('2099-01-02'),
  paid: true,
  approval: 'HR_ONLY',
  managerId: 'manager',
};
describe('leave balances and decisions', () => {
  it('returns a paginated leave overview with FE filters and balances', async () => {
    const db = database();
    db.employee.findMany.mockResolvedValue([
      {
        id: 'employee',
        employeeNo: 'EMP-001',
        name: 'Alex Employee',
        active: true,
        leavePolicyCodes: ['AL'],
        department: { id: 'department', name: 'Operations' },
      },
    ]);
    db.employee.count.mockResolvedValue(1);
    db.leavePolicy.findMany.mockResolvedValue([
      {
        id: 'policy',
        code: 'AL',
        name: 'Annual Leave',
        paid: true,
        active: true,
      },
    ]);
    db.leaveLedger.groupBy.mockResolvedValue([
      {
        employeeId: 'employee',
        policyId: 'policy',
        _sum: { days: new Prisma.Decimal(14) },
      },
    ]);
    db.leaveRequest.groupBy.mockImplementation(async (args: any) => {
      const statuses = args.where.status?.in as string[] | undefined;
      if (statuses?.includes('APPROVED'))
        return [
          {
            employeeId: 'employee',
            policyId: 'policy',
            _sum: { days: new Prisma.Decimal(2) },
          },
        ];
      if (statuses?.includes('PENDING_MANAGER'))
        return [
          {
            employeeId: 'employee',
            policyId: 'policy',
            _sum: { days: new Prisma.Decimal(1) },
          },
        ];
      return [];
    });

    const result = await new LeaveService(db).overview(
      { ...member, roles: ['HR'] },
      {
        page: 1,
        pageSize: 20,
        search: 'Alex',
        departmentId: 'department',
        active: true,
        year: 2026,
        month: 11,
      },
    );

    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          departmentId: 'department',
          OR: expect.any(Array),
        }),
        skip: 0,
        take: 20,
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: 'employee',
      employeeNo: 'EMP-001',
      balances: {
        AL: expect.objectContaining({
          entitled: 14,
          taken: 2,
          reserved: 1,
          balance: 12,
          available: 11,
        }),
      },
    });
    expect(result.meta).toMatchObject({
      total: 1,
      year: 2026,
      month: 11,
      asAt: '2026-11-30',
    });
  });

  it('lists leave records for one employee with pagination and status counts', async () => {
    const db = database();
    db.employee.findUnique.mockResolvedValue({ id: 'employee' });
    db.leaveRequest.findMany.mockResolvedValue([
      {
        ...leave,
        requestDate: new Date('2026-11-01'),
        startDate: new Date('2026-11-10'),
        endDate: new Date('2026-11-11'),
        employee: {
          id: 'employee',
          employeeNo: 'EMP-001',
          name: 'Alex Employee',
          department: { id: 'department', name: 'Operations' },
        },
        files: [],
      },
    ]);
    db.leaveRequest.count.mockResolvedValueOnce(1).mockResolvedValue(0);

    const result = await new LeaveService(db).list(
      { ...member, roles: ['HR'] },
      { page: 1, pageSize: 20, employeeId: 'employee' },
      true,
    );

    expect(db.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company', employeeId: 'employee' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].employee).toEqual({
      id: 'employee',
      employeeNo: 'EMP-001',
      name: 'Alex Employee',
      department: { id: 'department', name: 'Operations' },
    });
    expect(result.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      summary: { statusCounts: expect.any(Object) },
    });
  });

  it('returns only the leave policies selected for the employee', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      active: true,
      leavePolicyCodes: ['AL', 'ML'],
    });
    db.leavePolicy.findMany.mockResolvedValue([
      {
        id: 'annual',
        code: 'AL',
        name: 'Annual Leave',
        paid: true,
        active: true,
      },
      {
        id: 'medical',
        code: 'ML',
        name: 'Medical Leave',
        paid: true,
        active: true,
      },
    ]);
    db.leaveLedger.groupBy.mockResolvedValue([]);
    db.leaveRequest.groupBy.mockResolvedValue([]);

    const result = await new LeaveService(db).balance(member, { year: 2026 });

    expect(db.leavePolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: { in: ['AL', 'ML'] },
        }),
      }),
    );
    expect(result.data.map((policy) => policy.code)).toEqual(['AL', 'ML']);
  });

  it('returns no leave policies when the employee has no selections', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      active: true,
      leavePolicyCodes: [],
    });
    db.leavePolicy.findMany.mockResolvedValue([]);
    db.leaveLedger.groupBy.mockResolvedValue([]);
    db.leaveRequest.groupBy.mockResolvedValue([]);

    const result = await new LeaveService(db).balance(member, { year: 2026 });

    expect(db.leavePolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: { in: [] } }),
      }),
    );
    expect(result.data).toEqual([]);
  });

  it('blocks cancellation and approval in a calculated payroll month', async () => {
    const db = database();
    db.payrollRun.count.mockResolvedValue(1);
    db.leaveRequest.findUnique.mockResolvedValue({
      ...leave,
      status: 'APPROVED',
    });
    await expect(
      new LeaveService(db).cancel(member, 'leave'),
    ).rejects.toMatchObject({ response: { code: 'PAYROLL_PERIOD_LOCKED' } });
    db.leaveRequest.findUnique.mockResolvedValue(leave);
    await expect(
      new LeaveService(db).decide(
        { ...member, employeeId: null, roles: ['HR'] },
        'leave',
        { decision: 'APPROVE' },
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYROLL_PERIOD_LOCKED' } });
    expect(db.leaveLedger.create).not.toHaveBeenCalled();
    expect(db.leaveRequest.update).not.toHaveBeenCalled();
  });
  it('prevents self approval even for an HR user', async () => {
    const db = database();
    db.leaveRequest.findUnique.mockResolvedValue(leave);
    await expect(
      new LeaveService(db).decide({ ...member, roles: ['HR'] }, 'leave', {
        decision: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reserves pending applications when checking balance', async () => {
    const db = database();
    db.leaveLedger.aggregate.mockResolvedValue({
      _sum: { days: new Prisma.Decimal(5) },
    });
    db.leaveRequest.aggregate.mockResolvedValue({
      _sum: { days: new Prisma.Decimal(4) },
    });
    await expect(
      new LeaveService(db).available(db, leave as never),
    ).rejects.toMatchObject({
      response: { code: 'LEAVE_BALANCE_INSUFFICIENT' },
    });
  });
  it('posts approved usage in the same transaction', async () => {
    const db = database();
    db.leaveRequest.findUnique.mockResolvedValue(leave);
    db.leaveLedger.aggregate.mockResolvedValue({
      _sum: { days: new Prisma.Decimal(5) },
    });
    db.leaveRequest.aggregate.mockResolvedValue({ _sum: { days: null } });
    db.leaveRequest.update.mockResolvedValue({ ...leave, status: 'APPROVED' });
    await new LeaveService(db).decide(
      { ...member, userId: 'hr', employeeId: null, roles: ['HR'] },
      'leave',
      { decision: 'APPROVE' },
    );
    expect(db.leaveLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'usage:leave',
        days: new Prisma.Decimal(-2),
        year: 2099,
      }),
    });
    expect(db.leaveRequest.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'leave' } },
      data: expect.objectContaining({ status: 'APPROVED' }),
    });
  });
  it('requires a rejection comment', async () => {
    await expect(
      new LeaveService(database()).decide(member, 'leave', {
        decision: 'REJECT',
      }),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_REQUIRED' } });
  });
  it('refuses decisions after finalization', async () => {
    const db = database();
    db.leaveRequest.findUnique.mockResolvedValue({
      ...leave,
      status: 'APPROVED',
    });
    await expect(
      new LeaveService(db).decide(
        { ...member, employeeId: null, roles: ['HR'] },
        'leave',
        { decision: 'APPROVE' },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STATE' } });
  });
  it('reverses approved leave when cancelled', async () => {
    const db = database();
    db.leaveRequest.findUnique.mockResolvedValue({
      ...leave,
      status: 'APPROVED',
    });
    await new LeaveService(db).cancel(member, 'leave');
    expect(db.leaveLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'reverse:leave',
        days: new Prisma.Decimal(2),
      }),
    });
  });
});
describe('claim workflow', () => {
  const row = {
    id: 'claim',
    employeeId: 'employee',
    managerId: 'manager',
    status: 'PENDING_MANAGER',
    paymentMethod: 'BANK_TRANSFER',
    date: new Date('2026-01-01'),
  };
  it('allows only the assigned manager or owner at the manager step', async () => {
    const db = database();
    db.claim.findUnique.mockResolvedValue(row);
    await expect(
      new ClaimsService(db).decide(
        { ...member, employeeId: 'someone', roles: ['FINANCE'] },
        'claim',
        { decision: 'APPROVE' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('moves manager approval to finance', async () => {
    const db = database();
    db.claim.findUnique.mockResolvedValue(row);
    await new ClaimsService(db).decide(
      { ...member, employeeId: 'manager' },
      'claim',
      { decision: 'APPROVE' },
    );
    expect(db.claim.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'claim' } },
      data: expect.objectContaining({ status: 'PENDING_FINANCE' }),
    });
  });
  it('blocks standalone payment of payroll claims', async () => {
    const db = database();
    db.claim.findUnique.mockResolvedValue({
      ...row,
      status: 'APPROVED',
      paymentMethod: 'PAYROLL',
    });
    await expect(
      new ClaimsService(db).pay(member, 'claim', {
        paymentDate: '2026-02-01',
        paymentReference: 'bank',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STATE' } });
  });
  it('cannot pay twice', async () => {
    const db = database();
    db.claim.findUnique.mockResolvedValue({ ...row, status: 'PAID' });
    await expect(
      new ClaimsService(db).pay(member, 'claim', {
        paymentDate: '2026-02-01',
        paymentReference: 'bank',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STATE' } });
  });
});
