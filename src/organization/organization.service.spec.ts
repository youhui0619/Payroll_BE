import { OrganizationService } from './organization.service';
import { EmployeesService } from '../employees/employees.module';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

describe('organization and employee tenant boundaries', () => {
  const db = {
    department: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    position: { create: jest.fn(), findFirst: jest.fn() },
    employee: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const org = new OrganizationService(db as never);
  const employees = new EmployeesService(db as never);
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
  });
  it('scopes reads and returns not found for foreign employee IDs', async () => {
    db.employee.findUnique.mockResolvedValue(null);
    await expect(
      employees.get('company-a', 'foreign-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.employee.findUnique).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company-a', id: 'foreign-id' } },
    });
  });
  it('scopes updates using the composite tenant key', async () => {
    await org.updateDepartment('company-a', 'department', { name: 'HR' });
    expect(db.department.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company-a', id: 'department' } },
      data: { name: 'HR' },
    });
  });
  it('rejects a position referencing another company department before creation', async () => {
    db.department.findUnique.mockResolvedValue(null);
    await expect(
      org.createPosition('company-a', {
        departmentId: 'foreign',
        code: 'HR',
        title: 'HR',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.position.create).not.toHaveBeenCalled();
  });
  it('rejects a position from another department', async () => {
    db.department.findFirst.mockResolvedValue({ id: 'department-a' });
    db.position.findFirst.mockResolvedValue({
      id: 'position',
      departmentId: 'department-b',
    });
    await expect(
      employees.create('company-a', {
        employeeNo: 'E1',
        name: 'Name',
        joinedDate: '2026-10-01',
        departmentId: 'department-a',
        positionId: 'position',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.employee.create).not.toHaveBeenCalled();
  });
  it('rejects cross-company department assignments', async () => {
    db.department.findFirst.mockResolvedValue(null);
    await expect(
      employees.create('company-a', {
        employeeNo: 'E1',
        name: 'Name',
        joinedDate: '2026-10-01',
        departmentId: 'foreign',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.department.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', companyId: 'company-a', active: true },
    });
    expect(db.employee.create).not.toHaveBeenCalled();
  });
});
