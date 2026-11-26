import { Membership } from '@prisma/client';
import { EmployeesService } from './employees.service';

const manager = {
  userId: 'owner',
  companyId: 'company',
  roles: ['OWNER'],
} as Membership;

function database() {
  const db: any = {
    employee: { findUnique: jest.fn(), update: jest.fn() },
    leavePolicy: { findMany: jest.fn().mockResolvedValue([]) },
    leaveLedger: { aggregate: jest.fn(), upsert: jest.fn() },
    payrollRun: { count: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(db));
  return db;
}

describe('employee lifecycle', () => {
  it('confirms an active employee and records the actor and effective date', async () => {
    const db = database();
    db.employee.findUnique.mockResolvedValue({
      id: 'employee',
      companyId: 'company',
      joinedDate: new Date('2026-01-01T00:00:00.000Z'),
      active: true,
      employmentStatus: 'PROBATION',
    });
    db.payrollRun.count.mockResolvedValue(0);
    db.employee.update.mockResolvedValue({
      id: 'employee',
      active: true,
      employmentStatus: 'ACTIVE',
    });
    const result = await new EmployeesService(db).lifecycle(
      manager,
      'employee',
      'CONFIRM',
      { effectiveDate: '2026-02-01' },
    );
    expect(result.data.employmentStatus).toBe('ACTIVE');
    expect(db.employee.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'employee' } },
      data: expect.objectContaining({
        active: true,
        employmentStatus: 'ACTIVE',
        confirmationDate: new Date('2026-02-01T00:00:00.000Z'),
      }),
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company',
        actorId: 'owner',
        action: 'EMPLOYEE_CONFIRM',
        resourceId: 'employee',
      }),
    });
  });

  it('requires a reason for resignation and blocks finalized payroll periods', async () => {
    const db = database();
    db.employee.findUnique.mockResolvedValue({
      id: 'employee',
      joinedDate: new Date('2026-01-01T00:00:00.000Z'),
      active: true,
      employmentStatus: 'ACTIVE',
    });
    const service = new EmployeesService(db);
    await expect(
      service.lifecycle(manager, 'employee', 'RESIGN', {
        effectiveDate: '2026-02-01',
      }),
    ).rejects.toMatchObject({
      response: { code: 'LIFECYCLE_REASON_REQUIRED' },
    });

    db.payrollRun.count.mockResolvedValue(1);
    await expect(
      service.lifecycle(manager, 'employee', 'RESIGN', {
        effectiveDate: '2026-02-01',
        reason: 'Leaving the company',
      }),
    ).rejects.toMatchObject({
      response: { code: 'EMPLOYEE_LIFECYCLE_LOCKED' },
    });
    expect(db.employee.update).not.toHaveBeenCalled();
  });
});
