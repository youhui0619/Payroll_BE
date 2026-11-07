import { ClaimType, Prisma } from '@prisma/client';
import { fail } from '../common/domain';

export function validateClaimPolicy(
  type: Pick<
    ClaimType,
    'active' | 'effectiveFrom' | 'effectiveTo' | 'maxAmount'
  >,
  date: Date,
  amount: Prisma.Decimal,
) {
  if (!type.active) fail('CLAIM_TYPE_INACTIVE', 'This claim type is inactive.');
  if (
    (type.effectiveFrom && date < type.effectiveFrom) ||
    (type.effectiveTo && date > type.effectiveTo)
  )
    fail(
      'CLAIM_TYPE_INELIGIBLE',
      'Claim date is outside the type effective period.',
    );
  if (amount.lte(0))
    fail('INVALID_AMOUNT', 'Claim amount must be greater than zero.');
  if (type.maxAmount && amount.gt(type.maxAmount))
    fail(
      'CLAIM_LIMIT_EXCEEDED',
      'Claim exceeds the configured per-claim limit.',
    );
}

export function receiptScanAccepted(status: string) {
  return (
    status === 'CLEAN' ||
    (status === 'UNSCANNED' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.ALLOW_UNSCANNED_UPLOADS === 'true')
  );
}
