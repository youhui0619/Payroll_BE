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
        access_token: 'signed-token',
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
      access_token: 'signed-token',
    });
  });
});
