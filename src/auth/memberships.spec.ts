import { Membership } from '@prisma/client';
import { MembershipsService } from './memberships.module';
const owner = {
  userId: 'owner',
  companyId: 'company',
  roles: ['OWNER'],
} as Membership;
function database() {
  const db: any = {
    membership: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  return db;
}
describe('membership administration', () => {
  it('prevents an owner removing their own access', async () => {
    const db = database();
    db.membership.findFirst.mockResolvedValue({
      ...owner,
      id: 'member',
      active: true,
    });
    await expect(
      new MembershipsService(db).update(owner, 'member', {
        roles: ['HR'],
        active: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'SELF_ACCESS_REMOVAL' } });
    expect(db.membership.update).not.toHaveBeenCalled();
  });
  it('preserves the last active owner', async () => {
    const db = database();
    db.membership.findFirst.mockResolvedValue({
      userId: 'other',
      roles: ['OWNER'],
      active: true,
    });
    db.membership.count.mockResolvedValue(0);
    await expect(
      new MembershipsService(db).update(owner, 'member', {
        roles: ['HR'],
        active: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'LAST_OWNER' } });
  });
  it('rejects a foreign company membership', async () => {
    const db = database();
    db.membership.findFirst.mockResolvedValue(null);
    await expect(
      new MembershipsService(db).update(owner, 'foreign', {
        roles: ['HR'],
        active: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.membership.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', companyId: 'company' },
    });
  });
  it('changes access and records an audit event atomically', async () => {
    const db = database();
    db.membership.findFirst.mockResolvedValue({
      userId: 'hr',
      roles: ['HR'],
      active: true,
    });
    await new MembershipsService(db).update(owner, 'member', {
      roles: ['FINANCE'],
      active: false,
    });
    expect(db.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ['FINANCE'], active: false } }),
    );
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'owner',
        action: 'MEMBERSHIP_ACCESS_UPDATED',
        resourceId: 'member',
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});
