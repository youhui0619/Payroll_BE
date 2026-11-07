import { EmployeesService, SalaryDto } from './employees.module';
import { OrganizationService } from '../organization/organization.service';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('salary history and organization deactivation', () => {
  const db = {
    employee: { findUnique: jest.fn(), count: jest.fn() },
    salaryHistory: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    department: { findUnique: jest.fn(), update: jest.fn() },
    position: { count: jest.fn() },
    payrollRun: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new EmployeesService(db as never);
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.payrollRun.count.mockResolvedValue(0);
    db.employee.findUnique.mockResolvedValue({
      joinedDate: new Date('2026-01-01'),
    });
  });
  it('closes the old period and preserves precise decimal strings', async () => {
    db.salaryHistory.findFirst.mockResolvedValue({
      id: 'old',
      effectiveFrom: new Date('2026-01-01'),
    });
    db.salaryHistory.create.mockResolvedValue({
      id: 'new',
      amount: new Prisma.Decimal('4500.50'),
    });
    const result = await service.addSalary('tenant', 'employee', {
      amount: '4500.50',
      effectiveFrom: '2026-02-01',
    });
    expect(result.data.amount).toBe('4500.50');
    expect(db.salaryHistory.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { effectiveTo: new Date('2026-02-01') },
    });
    expect(db.salaryHistory.create).toHaveBeenCalledWith({
      data: {
        companyId: 'tenant',
        employeeId: 'employee',
        amount: '4500.50',
        effectiveFrom: new Date('2026-02-01'),
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('preserves salary intervals when a calculated period would be affected', async () => {
    db.salaryHistory.findFirst.mockResolvedValue({
      id: 'old',
      effectiveFrom: new Date('2026-01-01'),
    });
    db.payrollRun.count.mockResolvedValue(1);
    await expect(
      service.addSalary('tenant', 'employee', {
        amount: '5000',
        effectiveFrom: '2026-02-15',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.salaryHistory.update).not.toHaveBeenCalled();
    expect(db.salaryHistory.create).not.toHaveBeenCalled();
    expect(db.payrollRun.count).toHaveBeenCalledWith({
      where: {
        companyId: 'tenant',
        status: { not: 'DRAFT' },
        OR: [{ year: { gt: 2026 } }, { year: 2026, month: { gte: 2 } }],
      },
    });
  });
  it('rejects foreign employees without writing salary records', async () => {
    db.employee.findUnique.mockResolvedValue(null);
    await expect(
      service.addSalary('tenant', 'foreign', {
        amount: '1',
        effectiveFrom: '2026-02-01',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.salaryHistory.create).not.toHaveBeenCalled();
  });
  it('rejects salary before employment', async () => {
    await expect(
      service.addSalary('tenant', 'employee', {
        amount: '1',
        effectiveFrom: '2025-12-01',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('rejects replacing or inserting before existing salary history', async () => {
    db.salaryHistory.findFirst.mockResolvedValue({
      id: 'old',
      effectiveFrom: new Date('2026-02-01'),
    });
    await expect(
      service.addSalary('tenant', 'employee', {
        amount: '1',
        effectiveFrom: '2026-02-01',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.salaryHistory.update).not.toHaveBeenCalled();
  });
  it.each(['-1', '1e3', '12.345', '1000000000000', 'NaN'])(
    'rejects invalid money %s',
    async (amount) => {
      expect(
        (
          await validate(
            plainToInstance(SalaryDto, { amount, effectiveFrom: '2026-02-01' }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('rejects impossible dates', async () => {
    expect(
      (
        await validate(
          plainToInstance(SalaryDto, {
            amount: '100',
            effectiveFrom: '2026-02-30',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('blocks department deactivation while employees depend on it', async () => {
    db.department.findUnique.mockResolvedValue({ id: 'department' });
    db.employee.count.mockResolvedValue(1);
    db.position.count.mockResolvedValue(0);
    await expect(
      new OrganizationService(db as never).deactivate(
        'tenant',
        'department',
        'department',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.department.update).not.toHaveBeenCalled();
  });
  it('allows deactivation without active dependents', async () => {
    db.department.findUnique.mockResolvedValue({ id: 'department' });
    db.employee.count.mockResolvedValue(0);
    db.position.count.mockResolvedValue(0);
    await new OrganizationService(db as never).deactivate(
      'tenant',
      'department',
      'department',
    );
    expect(db.department.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'tenant', id: 'department' } },
      data: { active: false },
    });
  });
});
