import { Prisma } from '@prisma/client';
import {
  accrualDays,
  carryForwardDays,
  completedServiceYears,
  entitlementForService,
  eligibleForPolicy,
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
        { ...employee, employmentType: 'PART_TIME' },
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
