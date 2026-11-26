import { Prisma } from '@prisma/client';

type Policy = {
  code?: string;
  active?: boolean;
  defaultEntitlement: Prisma.Decimal | null;
  serviceEntitlementTiers: Prisma.JsonValue | null;
  entitlementCalculationMethod: string;
  entitlementGrantMethod: string;
  eligibility: string;
  carryForwardPolicy: string;
  maximumCarryForward: Prisma.Decimal | null;
  allowEmployeeSpecificSettings?: boolean;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

type Employee = {
  id?: string;
  joinedDate: Date;
  resignationDate: Date | null;
  employmentType: string | null;
  employmentStatus: string | null;
  active: boolean;
  leavePolicyCodes?: Prisma.JsonValue | null;
  leaveEntitlementOverrides?: Prisma.JsonValue | null;
  leaveServiceEntitlementTiers?: Prisma.JsonValue | null;
  medicalLeaveEntitlement?: Prisma.Decimal | null;
  medicalLeavePeriod?: string | null;
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
  const assignedCodes = Array.isArray(employee.leavePolicyCodes)
    ? employee.leavePolicyCodes
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toUpperCase())
    : [];
  if (Array.isArray(employee.leavePolicyCodes)) {
    if (!policy.code || !assignedCodes.includes(policy.code.toUpperCase()))
      return false;
  }

  const employmentType = employee.employmentType
    ?.trim()
    .toUpperCase()
    .replace(/-/g, '_');
  const employmentStatus = employee.employmentStatus?.trim().toUpperCase();
  switch (policy.eligibility) {
    case 'PERMANENT':
      return employmentType === 'PERMANENT';
    case 'PROBATION':
      return employmentStatus === 'PROBATION';
    case 'PART_TIME':
      return employmentType === 'PART_TIME';
    case 'CONTRACT_WORKER':
      return employmentType === 'CONTRACT';
    case 'INTERN':
      return employmentType === 'INTERN';
    case 'ALL_EMPLOYEES':
    default:
      return true;
  }
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : null;
}

function jsonValueForCode(
  value: Prisma.JsonValue | null | undefined,
  code: string,
) {
  const object = jsonObject(value);
  if (!object) return undefined;
  const entry = Object.entries(object).find(
    ([key]) => key.trim().toUpperCase() === code,
  );
  return entry?.[1];
}

function employeePolicy(policy: Policy, employee: Employee): Policy {
  if (!policy.code) return policy;
  const code = policy.code.toUpperCase();
  const employeeSettingsAllowed =
    policy.allowEmployeeSpecificSettings !== false;
  const entitlementOverride = employeeSettingsAllowed
    ? jsonValueForCode(employee.leaveEntitlementOverrides, code)
    : undefined;
  const serviceTierOverride = employeeSettingsAllowed
    ? jsonValueForCode(employee.leaveServiceEntitlementTiers, code)
    : undefined;
  const medicalOverride =
    employeeSettingsAllowed && code === 'ML'
      ? employee.medicalLeaveEntitlement
      : null;
  const medicalAnnualEntitlement =
    medicalOverride !== null && medicalOverride !== undefined
      ? medicalOverride.times(
          employee.medicalLeavePeriod?.trim().toLowerCase() === 'month'
            ? 12
            : 1,
        )
      : null;

  return {
    ...policy,
    ...(entitlementOverride !== undefined && entitlementOverride !== null
      ? { defaultEntitlement: new Prisma.Decimal(String(entitlementOverride)) }
      : {}),
    ...(medicalAnnualEntitlement !== null
      ? {
          defaultEntitlement: medicalAnnualEntitlement,
          entitlementCalculationMethod: 'FIXED',
        }
      : {}),
    ...(Array.isArray(serviceTierOverride)
      ? { serviceEntitlementTiers: serviceTierOverride }
      : {}),
  };
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

function employedWindow(employee: Employee, policy: Policy, year: number) {
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  const employmentStatus = employee.employmentStatus?.trim().toUpperCase();
  const ended = ['RESIGNED', 'TERMINATED', 'RETIRED'].includes(
    employmentStatus ?? '',
  );
  if ((!employee.active || ended) && !employee.resignationDate) return null;
  const startCandidates = [startOfYear, employee.joinedDate];
  if (policy.effectiveFrom) startCandidates.push(policy.effectiveFrom);
  const start = new Date(
    Math.max(...startCandidates.map((value) => value.getTime())),
  );
  const endCandidates = [endOfYear];
  if (employee.resignationDate) endCandidates.push(employee.resignationDate);
  if (policy.effectiveTo) endCandidates.push(policy.effectiveTo);
  const end = new Date(
    Math.min(...endCandidates.map((value) => value.getTime())),
  );
  return end < start ? null : { start, end, startOfYear, endOfYear };
}

export function accrualDays(policy: Policy, employee: Employee, year: number) {
  const applicablePolicy = employeePolicy(policy, employee);
  if (
    applicablePolicy.active === false ||
    applicablePolicy.entitlementGrantMethod === 'MANUAL' ||
    !eligibleForPolicy(applicablePolicy, employee)
  )
    return new Prisma.Decimal(0);
  const window = employedWindow(employee, applicablePolicy, year);
  if (!window) return new Prisma.Decimal(0);
  const full =
    applicablePolicy.entitlementCalculationMethod === 'SERVICE'
      ? entitlementForService(
          applicablePolicy,
          completedServiceYears(employee.joinedDate, window.endOfYear),
        )
      : (applicablePolicy.defaultEntitlement ?? new Prisma.Decimal(0));
  if (full.isZero()) return full;
  if (applicablePolicy.entitlementGrantMethod === 'MONTHLY_ACCRUAL') {
    let months = 0;
    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      if (window.start <= monthEnd && window.end >= monthStart) months += 1;
    }
    return full.div(12).times(months).toDecimalPlaces(2);
  }
  if (applicablePolicy.entitlementGrantMethod === 'SERVICE_ANNIVERSARY') {
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

export async function syncEmployeeLeaveEntitlements(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
  year: number,
) {
  const employee = await tx.employee.findUnique({
    where: { companyId_id: { companyId, id: employeeId } },
    select: {
      id: true,
      joinedDate: true,
      resignationDate: true,
      employmentType: true,
      employmentStatus: true,
      active: true,
      leavePolicyCodes: true,
      leaveEntitlementOverrides: true,
      leaveServiceEntitlementTiers: true,
      medicalLeaveEntitlement: true,
      medicalLeavePeriod: true,
    },
  });
  if (!employee) return [];

  const policies = await tx.leavePolicy.findMany({
    where: { companyId },
    orderBy: { code: 'asc' },
  });
  const synced: { policyId: string; days: string; kind: string }[] = [];
  for (const policy of policies) {
    const desired = accrualDays(policy, employee, year);
    const existing = await tx.leaveLedger.aggregate({
      where: {
        companyId,
        employeeId,
        policyId: policy.id,
        year,
        OR: [
          { kind: 'ACCRUAL' },
          { kind: 'ADJUSTMENT', reason: { startsWith: 'ENTITLEMENT_SYNC:' } },
        ],
      },
      _sum: { days: true },
    });
    const current = new Prisma.Decimal(existing._sum.days ?? 0);
    const delta = desired.minus(current);
    if (delta.isZero()) continue;

    const initial = current.isZero();
    const idempotencyKey = initial
      ? `accrual:${year}:${employeeId}:${policy.id}`
      : `entitlement-sync:${year}:${employeeId}:${policy.id}:${desired.toFixed(2)}`;
    await tx.leaveLedger.upsert({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
      create: {
        companyId,
        employeeId,
        policyId: policy.id,
        year,
        days: delta,
        kind: initial ? 'ACCRUAL' : 'ADJUSTMENT',
        reason: initial
          ? `Automatic ${policy.entitlementGrantMethod.toLowerCase()} entitlement for ${year}`
          : `ENTITLEMENT_SYNC:${year}:${policy.code}`,
        idempotencyKey,
      },
      update: {},
    });
    synced.push({
      policyId: policy.id,
      days: delta.toFixed(2),
      kind: initial ? 'ACCRUAL' : 'ADJUSTMENT',
    });
  }
  return synced;
}

export async function syncCompanyLeaveEntitlements(
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
) {
  const employees = await tx.employee.findMany({
    where: { companyId },
    select: { id: true },
  });
  const synced: {
    employeeId: string;
    policyId: string;
    days: string;
    kind: string;
  }[] = [];
  for (const employee of employees) {
    const entries = await syncEmployeeLeaveEntitlements(
      tx,
      companyId,
      employee.id,
      year,
    );
    synced.push(
      ...entries.map((entry) => ({ employeeId: employee.id, ...entry })),
    );
  }
  return synced;
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
