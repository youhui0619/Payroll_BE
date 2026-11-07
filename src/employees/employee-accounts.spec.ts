import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  EmployeeAccountsService,
  CreateEmployeeAccountDto,
} from './employee-accounts.service';
import { verifyPassword } from '../auth/password';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('employee accounts', () => {
  const db = {
    employee: { findFirst: jest.fn() },
    membership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new EmployeeAccountsService(db as never);
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.employee.findFirst.mockResolvedValue({ id: 'employee', active: true });
    db.user.create.mockResolvedValue({ id: 'user' });
    db.membership.create.mockResolvedValue({
      id: 'membership',
      roles: ['EMPLOYEE'],
    });
  });
  it('creates a hashed account with only the employee role', async () => {
    const result = await service.create('company', 'employee', {
      email: 'WORKER@example.com',
      password: 'owner123',
    });
    const payload = db.user.create.mock.calls[0][0].data;
    expect(payload.email).toBe('worker@example.com');
    expect(await verifyPassword('owner123', payload.passwordHash)).toBe(true);
    expect(db.membership.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        employeeId: 'employee',
        userId: 'user',
        roles: ['EMPLOYEE'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('password');
  });
  it('rejects another tenant employee', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.create('company', 'foreign', {
        email: 'a@example.com',
        password: 'owner123',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.employee.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company', id: 'foreign', active: true },
    });
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate employee links', async () => {
    db.membership.findUnique.mockResolvedValue({ id: 'linked' });
    await expect(
      service.create('company', 'employee', {
        email: 'a@example.com',
        password: 'owner123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('does not overwrite or attach an existing global user', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create('company', 'employee', {
        email: 'a@example.com',
        password: 'owner123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.membership.create).not.toHaveBeenCalled();
  });
  it('selects self via authenticated membership and omits salary data', async () => {
    db.membership.findFirst.mockResolvedValue({ employeeId: 'linked' });
    await service.me('company', 'membership');
    expect(db.employee.findFirst).toHaveBeenCalledWith({
      where: { id: 'linked', companyId: 'company', active: true },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        email: true,
        joinedDate: true,
        departmentId: true,
        positionId: true,
      },
    });
  });
  it('returns not found for an unlinked account', async () => {
    db.membership.findFirst.mockResolvedValue({ employeeId: null });
    await expect(service.me('company', 'membership')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.employee.findFirst).not.toHaveBeenCalled();
  });
  it('accepts eight-character passwords and rejects seven', async () => {
    expect(
      await validate(
        plainToInstance(CreateEmployeeAccountDto, {
          email: 'a@example.com',
          password: 'owner123',
        }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(CreateEmployeeAccountDto, {
            email: 'a@example.com',
            password: 'owner12',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
