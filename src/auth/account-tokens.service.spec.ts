import { AccountTokensService } from './account-tokens.service';
import { Membership } from '@prisma/client';

const actor = {
  id: 'membership',
  userId: 'owner',
  companyId: 'company',
  roles: ['OWNER'],
} as Membership;

function database() {
  const db: any = {
    employee: { findFirst: jest.fn() },
    membership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    accountToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(db));
  return db;
}

describe('account invitation and reset tokens', () => {
  it('stores only a hash and revokes earlier invitations', async () => {
    const db = database();
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      name: 'Employee',
      email: 'employee@example.com',
    });
    db.membership.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    db.accountToken.create.mockImplementation(async ({ data }: any) => ({
      id: 'token',
      ...data,
    }));
    const result = await new AccountTokensService(db).invite(
      actor,
      'employee',
      {},
    );
    expect(result.data.token).toHaveLength(43);
    expect(db.accountToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'INVITE',
          employeeId: 'employee',
        }),
      }),
    );
    expect(db.accountToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'INVITE',
        employeeId: 'employee',
        email: 'employee@example.com',
        tokenHash: expect.not.stringContaining(result.data.token),
      }),
    });
    expect(db.auditEvent.create).toHaveBeenCalled();
  });

  it('activates an invitation once and creates an employee-only membership', async () => {
    const db = database();
    db.accountToken.findFirst.mockResolvedValue({
      id: 'token',
      companyId: 'company',
      employeeId: 'employee',
      email: 'employee@example.com',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
    });
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      name: 'Employee',
    });
    db.membership.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: 'user' });
    db.membership.create.mockResolvedValue({
      id: 'membership',
      roles: ['EMPLOYEE'],
    });
    const result = await new AccountTokensService(db).activate({
      token: 'valid-token-value-that-is-long-enough',
      password: 'password123',
    });
    expect(result.data).toMatchObject({
      userId: 'user',
      membershipId: 'membership',
      employeeId: 'employee',
    });
    expect(db.accountToken.update).toHaveBeenCalledWith({
      where: { id: 'token' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ACCOUNT_ACTIVATED' }),
    });
  });

  it('rejects an expired or unknown reset token without updating a user', async () => {
    const db = database();
    db.accountToken.findFirst.mockResolvedValue(null);
    await expect(
      new AccountTokensService(db).resetPassword({
        token: 'missing-token-value-that-is-long-enough',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PASSWORD_RESET' } });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
