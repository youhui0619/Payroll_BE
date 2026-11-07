import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { UnpaidDay } from './salary-calculator';

export interface ApprovedLeaveInput {
  id: string;
  startDate: Date;
  endDate: Date;
  days: Prisma.Decimal;
  paid: boolean;
  status: string;
  daySnapshot: Prisma.JsonValue | null;
}
/** Never reconstruct approved dates from the employee's current schedule. */
export function resolveUnpaidDays(
  rows: readonly ApprovedLeaveInput[],
  start: Date,
  next: Date,
): UnpaidDay[] {
  const output: UnpaidDay[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      row.paid ||
      row.status !== 'APPROVED' ||
      row.endDate < start ||
      row.startDate >= next
    )
      continue;
    if (seen.has(row.id))
      fail(
        'DUPLICATE_LEAVE_INPUT',
        'An approved leave request was selected twice.',
      );
    seen.add(row.id);
    const snapshot = row.daySnapshot as {
      version?: unknown;
      dates?: unknown;
    } | null;
    if (
      !snapshot ||
      snapshot.version !== 1 ||
      !Array.isArray(snapshot.dates) ||
      !snapshot.dates.length ||
      snapshot.dates.length > 366
    )
      fail(
        'LEAVE_SNAPSHOT_REQUIRED',
        'Approved unpaid leave requires a frozen working-date snapshot.',
      );
    const dates = new Set<string>();
    let total = new Prisma.Decimal(0);
    for (const item of snapshot.dates) {
      if (
        !item ||
        typeof item.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
        !['0.5', '1'].includes(item.days)
      )
        fail(
          'INVALID_LEAVE_SNAPSHOT',
          'Invalid approved leave date or quantity.',
        );
      const date = new Date(item.date + 'T00:00:00.000Z');
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== item.date ||
        date < row.startDate ||
        date > row.endDate ||
        dates.has(item.date)
      )
        fail(
          'INVALID_LEAVE_SNAPSHOT',
          'Approved leave dates must be unique and within the request.',
        );
      dates.add(item.date);
      total = total.plus(item.days);
      if (date >= start && date < next)
        output.push({ date: item.date, days: item.days, sourceId: row.id });
    }
    if (!total.equals(row.days))
      fail(
        'INVALID_LEAVE_SNAPSHOT',
        'Approved leave date quantities do not reconcile with the request.',
      );
  }
  return output.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId),
  );
}
