import { ClaimsService } from './claims.service';

const membership = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: null,
  roles: ['HR'],
  active: true,
} as any;

function database() {
  const db: any = {
    claimType: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((input: unknown) =>
    (input as (tx: any) => unknown)(db),
  );
  return db;
}

describe('ClaimsService', () => {
  it('deactivates an active claim type', async () => {
    const db = database();
    db.claimType.findUnique.mockResolvedValue({ id: 'type', active: true });
    db.claimType.update.mockResolvedValue({ id: 'type', active: false });

    await expect(
      new ClaimsService(db).deactivateType(membership, 'type'),
    ).resolves.toEqual({ data: { id: 'type', active: false } });
    expect(db.claimType.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'type' } },
      data: { active: false },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'CLAIM_TYPE_DEACTIVATED',
        resourceId: 'type',
      },
    });
  });

  it('reactivates an inactive claim type through the same endpoint', async () => {
    const db = database();
    db.claimType.findUnique.mockResolvedValue({ id: 'type', active: false });
    db.claimType.update.mockResolvedValue({ id: 'type', active: true });

    await expect(
      new ClaimsService(db).deactivateType(membership, 'type'),
    ).resolves.toEqual({ data: { id: 'type', active: true } });
    expect(db.claimType.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'type' } },
      data: { active: true },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'CLAIM_TYPE_ACTIVATED',
        resourceId: 'type',
      },
    });
  });
});
