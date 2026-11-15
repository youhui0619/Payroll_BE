import { Prisma } from '@prisma/client';
import { CommissionService } from './commission.service';

const membership = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: null,
  roles: ['FINANCE'],
  active: true,
} as any;

function database() {
  const db: any = {
    commissionIncentiveSetting: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    commissionPayrollRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employee: { findFirst: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    return (input as (tx: any) => unknown)(db);
  });
  return db;
}

describe('CommissionService', () => {
  it('creates a percentage plan with Decimal-backed settings', async () => {
    const db = database();
    db.commissionIncentiveSetting.findFirst.mockResolvedValue(null);
    db.commissionIncentiveSetting.create.mockImplementation(
      ({ data }: any) => ({
        ...data,
        id: 'setting',
        _count: { records: 0 },
      }),
    );

    const result = await new CommissionService(db).createSetting(membership, {
      code: 'sales-comm',
      name: 'Sales Commission',
      commissionType: 'REVENUE_COMMISSION',
      calculationMethod: 'PERCENTAGE_OF_REVENUE',
      rate: '5',
      amount: null,
      eligibleEmployees: 'ALL_EMPLOYEES',
      payrollEarningCode: 'COMM-SALES',
    });

    expect(db.commissionIncentiveSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'SALES-COMM',
          rate: expect.any(Prisma.Decimal),
          amount: null,
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        code: 'SALES-COMM',
        rate: '5.0000',
        amount: null,
      }),
    );
  });

  it('calculates a commission record with Decimal arithmetic', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      departmentId: 'department',
      positionId: 'position',
      name: 'Alex',
    });
    db.commissionIncentiveSetting.findFirst.mockResolvedValue({
      id: 'setting',
      code: 'SALES-COMM',
      name: 'Sales Commission',
      payrollEarningCode: 'COMM-SALES',
      commissionType: 'REVENUE_COMMISSION',
      calculationMethod: 'PERCENTAGE_OF_REVENUE',
      calculationFrequency: 'MONTHLY',
      payoutTiming: 'CURRENT_PAYROLL',
      rate: new Prisma.Decimal('5'),
      amount: null,
      eligibleEmployees: 'ALL_EMPLOYEES',
      eligibleDepartmentIds: [],
      eligiblePositionIds: [],
      eligibleEmployeeIds: [],
      requiresApproval: true,
    });
    db.commissionPayrollRecord.create.mockImplementation(({ data }: any) => ({
      ...data,
      id: 'record',
      createdAt: new Date('2026-10-05T00:00:00.000Z'),
      employee: { id: 'employee', employeeNo: 'EMP-001', name: 'Alex' },
      setting: { id: 'setting', code: 'SALES-COMM', name: 'Sales Commission' },
    }));

    const result = await new CommissionService(db).createRecord(membership, {
      employeeId: 'employee',
      planCode: 'SALES-COMM',
      calculationBasis: '24000.00',
      referenceId: 'INV-001',
      notes: 'Monthly revenue commission',
    });

    expect(db.commissionPayrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: expect.any(Prisma.Decimal),
          status: 'PENDING_APPROVAL',
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        employeeName: 'Alex',
        planName: 'Sales Commission',
        calculationBasis: '24000.00',
        amount: '1200.00',
      }),
    );
  });
});
