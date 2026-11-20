export const ACTIVE_STATUS_VALUES = ['ACTIVE', 'INACTIVE'] as const;

export const REQUEST_STATUS_VALUES = [
  'DRAFT',
  'PENDING_MANAGER',
  'PENDING_HR',
  'PENDING_FINANCE',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'PAID',
] as const;

export const PAYROLL_STATUS_VALUES = [
  'DRAFT',
  'CALCULATED',
  'APPROVED',
  'PUBLISHED',
  'PAID',
] as const;

export const FILE_SCAN_STATUS_VALUES = [
  'UNSCANNED',
  'CLEAN',
  'INFECTED',
] as const;

export function makeStatusCounts<T extends string>(
  statuses: readonly T[],
  counts: readonly number[] = [],
): Record<T, number> {
  return Object.fromEntries(
    statuses.map((status, index) => [status, counts[index] ?? 0]),
  ) as Record<T, number>;
}
