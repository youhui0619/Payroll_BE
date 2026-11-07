import { Prisma } from '@prisma/client';
import { resolveUnpaidDays } from './leave-inputs';
const start = new Date('2026-06-01'),
  next = new Date('2026-07-01');
const row = {
  id: 'leave',
  startDate: new Date('2026-05-29'),
  endDate: new Date('2026-06-02'),
  days: new Prisma.Decimal(3),
  status: 'APPROVED',
  paid: false,
  daySnapshot: {
    version: 1,
    dates: [
      { date: '2026-05-29', days: '1' },
      { date: '2026-06-01', days: '1' },
      { date: '2026-06-02', days: '1' },
    ],
  },
};
describe('frozen payroll leave inputs', () => {
  it('clips a cross-month request to its recorded working dates', () => {
    expect(resolveUnpaidDays([row], start, next)).toEqual([
      { date: '2026-06-01', days: '1', sourceId: 'leave' },
      { date: '2026-06-02', days: '1', sourceId: 'leave' },
    ]);
  });
  it('excludes paid and unapproved requests', () => {
    expect(
      resolveUnpaidDays(
        [
          { ...row, paid: true },
          { ...row, status: 'CANCELLED' },
          { ...row, status: 'PENDING_HR' },
        ],
        start,
        next,
      ),
    ).toEqual([]);
  });
  it('refuses missing snapshots, duplicate requests and mismatched totals', () => {
    expect(() =>
      resolveUnpaidDays([{ ...row, daySnapshot: null }], start, next),
    ).toThrow();
    expect(() => resolveUnpaidDays([row, row], start, next)).toThrow();
    expect(() =>
      resolveUnpaidDays([{ ...row, days: new Prisma.Decimal(2) }], start, next),
    ).toThrow();
  });
  it('rejects invalid, duplicate and out-of-range snapshot dates', () => {
    for (const dates of [
      [{ date: '2026-02-30', days: '1' }],
      [{ date: '2026-06-03', days: '1' }],
      [
        { date: '2026-06-01', days: '1' },
        { date: '2026-06-01', days: '1' },
      ],
    ])
      expect(() =>
        resolveUnpaidDays(
          [{ ...row, daySnapshot: { version: 1, dates } }],
          start,
          next,
        ),
      ).toThrow();
  });
  it('retains half days', () => {
    expect(
      resolveUnpaidDays(
        [
          {
            ...row,
            days: new Prisma.Decimal('0.5'),
            daySnapshot: {
              version: 1,
              dates: [{ date: '2026-06-01', days: '0.5' }],
            },
          },
        ],
        start,
        next,
      )[0].days,
    ).toBe('0.5');
  });
});
