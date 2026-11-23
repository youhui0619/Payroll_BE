import { Prisma } from '@prisma/client';

type Policy = {
  defaultEntitlement: Prisma.Decimal | null;
  serviceEntitlementTiers: Prisma.JsonValue | null;
  entitlementCalculationMethod: string;
  entitlementGrantMethod: string;
  eligibility: string;
  carryForwardPolicy: string;
  maximumCarryForward: Prisma.Decimal | null;
};

type Employee = {
  joinedDate: Date;
  resignationDate: Date | null;
  employmentType: string | null;
  employmentStatus: string | null;
  active: boolean;
};

const dayMs = 86_400_000;

function dateAtYear(date: Date, year: number) {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, day));
  // A February 29 join date uses February 28 in non-leap years.
  if (candidate.getUTCMonth() !== month) return new Date(Date.UTC(year, 1, 28));
  return candidate;
}

export function completedServiceYears(joinedDate: Date, asOf: Date) {
  let years = asOf.getUTCFullYear() - joinedDate.getUTCFullYear();
  if (asOf < dateAtYear(joinedDate, asOf.getUTCFullYear())) years -= 1;
  return Math.max(0, years);
}

export function eligibleForPolicy(policy: Policy, employee: Employee) {
  switch (policy.eligibility) {
    case 'PERMANENT':
      return employee.employmentType === 'PERMANENT';
    case 'PROBATION':
      return employee.employmentStatus === 'PROBATION';
    case 'PART_TIME':
      return employee.employmentType === 'PART_TIME';
    case 'CONTRACT_WORKER':
      return employee.employmentType === 'CONTRACT';
    case 'INTERN':
      return employee.employmentType === 'INTERN';
    case 'ALL_EMPLOYEES':
    default:
      return true;
  }
}

export function entitlementForService(policy: Policy, serviceYears: number) {
  const tiers = Array.isArray(policy.serviceEntitlementTiers)
    ? policy.serviceEntitlementTiers.filter(
        (value): value is Prisma.JsonObject =>
          !!value && typeof value === 'object' && !Array.isArray(value),
      )
    : [];
  for (const tier of tiers) {
    const from =
      tier.serviceFrom === null || tier.serviceFrom === undefined
        ? 0
        : Number(tier.serviceFrom);
    const to =
      tier.serviceTo === null || tier.serviceTo === undefined
        ? null
        : Number(tier.serviceTo);
    const days =
      tier.daysPerYear === null || tier.daysPerYear === undefined
        ? null
        : new Prisma.Decimal(String(tier.daysPerYear));
    if (
      days &&
      Number.isFinite(from) &&
      (to === null || Number.isFinite(to)) &&
      serviceYears >= from &&
      (to === null || serviceYears <= to)
    )
      return days;
  }
  return policy.defaultEntitlement ?? new Prisma.Decimal(0);
}

function employedWindow(employee: Employee, year: number) {
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  if (!employee.active && !employee.resignationDate) return null;
  const start =
    employee.joinedDate > startOfYear ? employee.joinedDate : startOfYear;
  const end =
    employee.resignationDate && employee.resignationDate < endOfYear
      ? employee.resignationDate
      : endOfYear;
  return end < start ? null : { start, end, startOfYear, endOfYear };
}

export function accrualDays(policy: Policy, employee: Employee, year: number) {
  if (
    policy.entitlementGrantMethod === 'MANUAL' ||
    !eligibleForPolicy(policy, employee)
  )
    return new Prisma.Decimal(0);
  const window = employedWindow(employee, year);
  if (!window) return new Prisma.Decimal(0);
  const full = entitlementForService(
    policy,
    completedServiceYears(employee.joinedDate, window.endOfYear),
  );
  if (full.isZero()) return full;
  if (policy.entitlementGrantMethod === 'MONTHLY_ACCRUAL') {
    let months = 0;
    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      if (window.start <= monthEnd && window.end >= monthStart) months += 1;
    }
    return full.div(12).times(months).toDecimalPlaces(2);
  }
  if (policy.entitlementGrantMethod === 'SERVICE_ANNIVERSARY') {
    const anniversary = dateAtYear(employee.joinedDate, year);
    return anniversary >= window.start && anniversary <= window.end
      ? full
      : new Prisma.Decimal(0);
  }
  const employedDays =
    Math.floor((window.end.getTime() - window.start.getTime()) / dayMs) + 1;
  const yearDays =
    Math.floor(
      (window.endOfYear.getTime() - window.startOfYear.getTime()) / dayMs,
    ) + 1;
  return full.times(employedDays).div(yearDays).toDecimalPlaces(2);
}

export function carryForwardDays(
  policy: Policy,
  previousBalance: Prisma.Decimal,
) {
  if (
    previousBalance.isNegative() ||
    policy.carryForwardPolicy === 'NONE' ||
    policy.carryForwardPolicy === 'HR_REVIEW'
  )
    return new Prisma.Decimal(0);
  if (policy.carryForwardPolicy === 'LIMITED' && policy.maximumCarryForward)
    return Prisma.Decimal.min(previousBalance, policy.maximumCarryForward);
  return previousBalance;
}
