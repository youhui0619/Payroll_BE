import { WorkforceService } from './workforce.service';

const membership = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: null,
  roles: ['OWNER'],
  active: true,
} as any;

function database() {
  const db: any = {
    workLocation: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    workSchedule: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    publicHoliday: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    employee: { count: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    return (input as (tx: any) => unknown)(db);
  });
  return db;
}

describe('WorkforceService', () => {
  it('filters work locations for FE list queries', async () => {
    const db = database();
    db.workLocation.findMany.mockResolvedValue([]);
    db.workLocation.count.mockResolvedValue(0);

    await new WorkforceService(db).locations(membership, {
      page: 1,
      pageSize: 20,
      search: 'hq',
      type: 'OFFICE',
      state: 'JOHOR',
      active: true,
    } as any);

    expect(db.workLocation.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company',
        type: 'OFFICE',
        state: 'JOHOR',
        active: true,
        OR: expect.any(Array),
      }),
      skip: 0,
      take: 20,
      orderBy: { code: 'asc' },
    });
  });

  it('deactivates a schedule only when no active employee uses it', async () => {
    const db = database();
    db.workSchedule.findUnique.mockResolvedValue({ id: 'schedule' });
    db.employee.count.mockResolvedValue(0);
    db.workSchedule.update.mockResolvedValue({
      id: 'schedule',
      active: false,
    });

    await expect(
      new WorkforceService(db).deactivateSchedule(membership, 'schedule'),
    ).resolves.toEqual({ data: { id: 'schedule', active: false } });
    expect(db.workSchedule.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'schedule' } },
      data: { active: false },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'SCHEDULE_DEACTIVATED',
        resourceId: 'schedule',
      },
    });
  });
});
