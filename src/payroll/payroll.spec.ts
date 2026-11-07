import { Membership, Prisma } from '@prisma/client';
import { PayrollService, payrollPeriod } from './payroll.service';

const member = {
  companyId: 'company',
  userId: 'owner',
  roles: ['OWNER'],
} as Membership;
function database() {
  const tx: any = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'run',
        year: 2028,
        month: 2,
        status: 'DRAFT',
      }),
    },
    payrollSettings: { findUnique: jest.fn().mockResolvedValue({}) },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    statutoryRuleset: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceSession: { count: jest.fn().mockResolvedValue(0) },
    leaveRequest: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  tx.$transaction = jest.fn((fn) => fn(tx));
  return tx;
}
describe('payroll preparation', () => {
  it('uses calendar boundaries including leap years', () => {
    expect(payrollPeriod(2028, 2).end.toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(payrollPeriod(2026, 12).next.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
  it('hides runs from other tenants', async () => {
    const db = database();
    db.payrollRun.findUnique.mockResolvedValue(null);
    await expect(
      new PayrollService(db).preflight(member, 'foreign'),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.payrollRun.findUnique).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'foreign' } },
    });
  });
  it('never reports payroll ready while engines are missing', async () => {
    const result = await new PayrollService(database()).preflight(
      member,
      'run',
    );
    expect(result.data.ready).toBe(false);
    expect(result.data.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'PCB_CALCULATOR_PENDING',
        'PAYROLL_CALCULATOR_PENDING',
        'NO_ELIGIBLE_EMPLOYEES',
      ]),
    );
  });
  it('detects a salary gap inside the period', async () => {
    const db = database();
    db.employee.findMany.mockResolvedValue([
      {
        id: 'employee',
        joinedDate: new Date('2020-01-01'),
        salaries: [
          {
            id: 'salary1',
            amount: new Prisma.Decimal('3100'),
            effectiveFrom: new Date('2028-02-01'),
            effectiveTo: new Date('2028-02-10'),
          },
          {
            id: 'salary2',
            amount: new Prisma.Decimal('3200'),
            effectiveFrom: new Date('2028-02-11'),
            effectiveTo: null,
          },
        ],
      },
    ]);
    const result = await new PayrollService(db).preflight(member, 'run');
    expect(result.data.issues.map((i) => i.code)).toContain(
      'SALARY_COVERAGE_MISSING',
    );
  });
  it('accepts contiguous salary periods from the joining date', async () => {
    const db = database();
    db.employee.findMany.mockResolvedValue([
      {
        id: 'employee',
        joinedDate: new Date('2028-02-05'),
        salaries: [
          {
            id: 'salary1',
            amount: new Prisma.Decimal('3100'),
            effectiveFrom: new Date('2028-02-05'),
            effectiveTo: new Date('2028-02-10'),
          },
          {
            id: 'salary2',
            amount: new Prisma.Decimal('3200'),
            effectiveFrom: new Date('2028-02-10'),
            effectiveTo: null,
          },
        ],
      },
    ]);
    const result = await new PayrollService(db).preflight(member, 'run');
    expect(result.data.issues.map((i) => i.code)).not.toContain(
      'SALARY_COVERAGE_MISSING',
    );
  });
});
