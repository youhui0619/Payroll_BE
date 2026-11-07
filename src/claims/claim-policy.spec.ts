import { Prisma } from '@prisma/client';
import { receiptScanAccepted, validateClaimPolicy } from './claim-policy';
const type = {
  active: true,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  maxAmount: new Prisma.Decimal('100.00'),
};
describe('claim policy', () => {
  it('accepts exact amount limits and inclusive effective boundaries', () => {
    for (const date of ['2026-01-01', '2026-12-31'])
      expect(() =>
        validateClaimPolicy(type, new Date(date), new Prisma.Decimal('100')),
      ).not.toThrow();
  });
  it.each(['0', '-0.01', '100.01'])('rejects invalid amount %s', (amount) => {
    expect(() =>
      validateClaimPolicy(
        type,
        new Date('2026-06-01'),
        new Prisma.Decimal(amount),
      ),
    ).toThrow();
  });
  it('rejects inactive and expired claim types', () => {
    expect(() =>
      validateClaimPolicy(
        { ...type, active: false },
        new Date('2026-06-01'),
        new Prisma.Decimal('1'),
      ),
    ).toThrow();
    expect(() =>
      validateClaimPolicy(
        type,
        new Date('2027-01-01'),
        new Prisma.Decimal('1'),
      ),
    ).toThrow();
  });
  it('never accepts unscanned receipts in production', () => {
    const env = process.env.NODE_ENV,
      allow = process.env.ALLOW_UNSCANNED_UPLOADS;
    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_UNSCANNED_UPLOADS = 'true';
      expect(receiptScanAccepted('UNSCANNED')).toBe(false);
      expect(receiptScanAccepted('CLEAN')).toBe(true);
      expect(receiptScanAccepted('INFECTED')).toBe(false);
    } finally {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      if (allow === undefined) delete process.env.ALLOW_UNSCANNED_UPLOADS;
      else process.env.ALLOW_UNSCANNED_UPLOADS = allow;
    }
  });
});
