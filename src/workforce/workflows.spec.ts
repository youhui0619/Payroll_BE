import { AttendanceService } from '../attendance/attendance.module';
import { LeaveService, workingDays } from '../leave/leave.service';
import { ClaimsService } from '../claims/claims.module';
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
      findUnique: jest.fn(),
    },
    company: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ timezone: 'Asia/Kuala_Lumpur' }),
    },
    attendanceSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leaveRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    leaveLedger: { aggregate: jest.fn(), create: jest.fn() },
    payrollRun: { count: jest.fn().mockResolvedValue(0) },
    leaveEvent: { create: jest.fn() },
    claim: { findUnique: jest.fn(), update: jest.fn() },
    claimEvent: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  tx.$transaction.mockImplementation((fn) => fn(tx));
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
        clockIn: expect.any(Date),
        clockInKey: 'key',
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
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
