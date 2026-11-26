import { Prisma } from '@prisma/client';
import {
  accrualDays,
  carryForwardDays,
  completedServiceYears,
  entitlementForService,
  eligibleForPolicy,
  syncEmployeeLeaveEntitlements,
} from './leave-accrual';

const employee = {
  joinedDate: new Date('2023-06-15T00:00:00.000Z'),
  resignationDate: null,
  employmentType: 'PERMANENT',
  employmentStatus: 'ACTIVE',
  active: true,
};

const policy = {
  defaultEntitlement: new Prisma.Decimal(12),
  serviceEntitlementTiers: null,
  entitlementCalculationMethod: 'FIXED',
  entitlementGrantMethod: 'ANNUAL',
  eligibility: 'ALL_EMPLOYEES',
  carryForwardPolicy: 'LIMITED',
  maximumCarryForward: new Prisma.Decimal(5),
};

describe('leave accrual rules', () => {
  it('calculates completed service and annual day proration with decimals', () => {
    expect(
      completedServiceYears(
        new Date('2023-06-15T00:00:00.000Z'),
        new Date('2026-06-14T00:00:00.000Z'),
      ),
    ).toBe(2);
    expect(
      accrualDays(
        policy,
        { ...employee, joinedDate: new Date('2026-07-01T00:00:00.000Z') },
        2026,
      ).toFixed(2),
    ).toBe('6.05');
  });

  it('supports service tiers, eligibility and monthly accrual', () => {
    const tiered = {
      ...policy,
      entitlementCalculationMethod: 'SERVICE',
      serviceEntitlementTiers: [
        { serviceFrom: 0, serviceTo: 1, daysPerYear: 8 },
        { serviceFrom: 2, serviceTo: null, daysPerYear: 14 },
      ],
    };
    expect(entitlementForService(tiered, 2).toFixed(2)).toBe('14.00');
    expect(
      eligibleForPolicy({ ...policy, eligibility: 'PERMANENT' }, employee),
    ).toBe(true);
    expect(
      eligibleForPolicy(
        { ...policy, eligibility: 'PART_TIME' },
        { ...employee, employmentType: 'PART-TIME' },
      ),
    ).toBe(true);
    expect(
      accrualDays(
        { ...policy, entitlementGrantMethod: 'MONTHLY_ACCRUAL' },
        { ...employee, joinedDate: new Date('2026-07-15T00:00:00.000Z') },
        2026,
      ).toFixed(2),
    ).toBe('6.00');
  });

  it('applies employee policy assignments and entitlement overrides', () => {
    const assigned = {
      ...employee,
      leavePolicyCodes: ['AL'],
      leaveEntitlementOverrides: { AL: 10 },
    };
    expect(
      accrualDays({ ...policy, code: 'AL' }, assigned, 2026).toFixed(2),
    ).toBe('10.00');
    expect(
      accrualDays({ ...policy, code: 'ML' }, assigned, 2026).toFixed(2),
    ).toBe('0.00');
    expect(
      accrualDays(
        { ...policy, code: 'AL' },
        { ...employee, employmentStatus: 'RESIGNED', active: true },
        2026,
      ).toFixed(2),
    ).toBe('0.00');
    expect(
      accrualDays(
        { ...policy, code: 'ML' },
        {
          ...employee,
          medicalLeaveEntitlement: new Prisma.Decimal(2),
          medicalLeavePeriod: 'month',
        },
        2026,
      ).toFixed(2),
    ).toBe('24.00');
  });

  it('creates an idempotent accrual and adjusts it when entitlement changes', async () => {
    const tx: any = {
      employee: { findUnique: jest.fn() },
      leavePolicy: { findMany: jest.fn() },
      leaveLedger: { aggregate: jest.fn(), upsert: jest.fn() },
    };
    const employeeWithId = { ...employee, id: 'employee' };
    const annualLeave = {
      ...policy,
      id: 'policy',
      code: 'AL',
      defaultEntitlement: new Prisma.Decimal(8),
    };
    tx.employee.findUnique.mockResolvedValue(employeeWithId);
    tx.leavePolicy.findMany.mockResolvedValue([annualLeave]);
    tx.leaveLedger.aggregate.mockResolvedValue({ _sum: { days: null } });

    await syncEmployeeLeaveEntitlements(tx, 'company', 'employee', 2026);

    expect(tx.leaveLedger.upsert).toHaveBeenCalledWith({
      where: {
        companyId_idempotencyKey: {
          companyId: 'company',
          idempotencyKey: 'accrual:2026:employee:policy',
        },
      },
      create: expect.objectContaining({
        days: new Prisma.Decimal(8),
        kind: 'ACCRUAL',
      }),
      update: {},
    });

    tx.leaveLedger.aggregate.mockResolvedValue({
      _sum: { days: new Prisma.Decimal(8) },
    });
    tx.leavePolicy.findMany.mockResolvedValue([
      { ...annualLeave, defaultEntitlement: new Prisma.Decimal(12) },
    ]);
    await syncEmployeeLeaveEntitlements(tx, 'company', 'employee', 2026);

    expect(tx.leaveLedger.upsert).toHaveBeenLastCalledWith({
      where: {
        companyId_idempotencyKey: {
          companyId: 'company',
          idempotencyKey: 'entitlement-sync:2026:employee:policy:12.00',
        },
      },
      create: expect.objectContaining({
        days: new Prisma.Decimal(4),
        kind: 'ADJUSTMENT',
        reason: 'ENTITLEMENT_SYNC:2026:AL',
      }),
      update: {},
    });
  });

  it('caps carry-forward and skips HR-review carry', () => {
    expect(carryForwardDays(policy, new Prisma.Decimal(8)).toFixed(2)).toBe(
      '5.00',
    );
    expect(
      carryForwardDays(
        { ...policy, carryForwardPolicy: 'HR_REVIEW' },
        new Prisma.Decimal(8),
      ).toFixed(2),
    ).toBe('0.00');
  });
});
