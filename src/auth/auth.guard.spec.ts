import { AuthGuard } from './auth.module';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('tenant authentication guard', () => {
  const request = { headers: { authorization: 'Bearer test' } };
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  const token = {
    sub: 'user',
    membershipId: 'membership',
    companyId: 'company',
    version: 2,
  };
  const db = { membership: { findFirst: jest.fn() } };
  const jwt = { verifyAsync: jest.fn().mockResolvedValue(token) };
  const reflector = {
    getAllAndOverride: jest.fn((key) => (key === 'roles' ? ['OWNER'] : false)),
  };
  const guard = new AuthGuard(db as never, jwt as never, reflector as never);
  it('requires the token membership, tenant and active identity together', async () => {
    db.membership.findFirst.mockResolvedValue({ roles: ['OWNER'] });
    expect(await guard.canActivate(ctx as never)).toBe(true);
    expect(db.membership.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'membership',
        userId: 'user',
        companyId: 'company',
        active: true,
        company: { active: true },
        user: { active: true, tokenVersion: 2 },
      },
    });
  });
  it('rejects a missing, disabled or stale membership', async () => {
    db.membership.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('rejects a role without access', async () => {
    db.membership.findFirst.mockResolvedValue({ roles: ['EMPLOYEE'] });
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
