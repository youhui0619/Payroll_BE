import { AuthController } from './auth.controller';
import { hashPassword } from './password';

describe('AuthController', () => {
  const db = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findMany: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn() };
  const controller = new AuthController(db as any, jwt as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns login token and user summary for the active membership', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'user',
      email: 'owner@example.com',
      fullName: 'Owner User',
      passwordHash: await hashPassword('password123'),
      active: true,
      lockedUntil: null,
      tokenVersion: 3,
    });
    db.membership.findMany.mockResolvedValue([
      {
        id: 'membership',
        companyId: 'company',
        userId: 'user',
        employeeId: 'employee',
        roles: ['OWNER'],
        active: true,
        employee: { name: 'Linked Employee' },
      },
    ]);
    db.user.update.mockResolvedValue({ failedLoginCount: 0 });
    jwt.signAsync.mockResolvedValue('signed-token');

    const result = await controller.login({
      email: 'owner@example.com',
      password: 'password123',
    });

    expect(result).toEqual({
      data: {
        accessToken: 'signed-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: 'user',
          name: 'Owner User',
          email: 'owner@example.com',
          roles: ['OWNER'],
          companyId: 'company',
          membershipId: 'membership',
          employeeId: 'employee',
        },
      },
    });
  });

  it('falls back to the linked employee name when the account name is empty', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'user',
      email: 'employee@example.com',
      fullName: null,
      passwordHash: await hashPassword('password123'),
      active: true,
      lockedUntil: null,
      tokenVersion: 1,
    });
    db.membership.findMany.mockResolvedValue([
      {
        id: 'membership',
        companyId: 'company',
        userId: 'user',
        employeeId: 'employee',
        roles: ['EMPLOYEE'],
        active: true,
        employee: { name: 'Employee One' },
      },
    ]);
    db.user.update.mockResolvedValue({ failedLoginCount: 0 });
    jwt.signAsync.mockResolvedValue('signed-token');

    const result = await controller.login({
      email: 'employee@example.com',
      password: 'password123',
    });

    expect(result.data.user).toMatchObject({
      id: 'user',
      name: 'Employee One',
      roles: ['EMPLOYEE'],
    });
  });
});
