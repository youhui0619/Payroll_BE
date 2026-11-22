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
      create: jest.fn(),
      update: jest.fn(),
    },
    employee: { count: jest.fn() },
    auditEvent: { create: jest.fn() },
    $executeRaw: jest.fn(),
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

  it('returns workingSchedule using the FE shape', async () => {
    const db = database();
    const schedule = {
      id: 'schedule',
      code: 'STANDARD-5D',
      scheduleDays: {
        days: [
          {
            day: 'Monday',
            isWorkingDay: true,
            startTime: '09:00',
            endTime: '18:00',
            breakStartTime: '13:00',
            breakEndTime: '14:00',
          },
        ],
      },
    };
    db.workSchedule.findMany.mockResolvedValue([schedule]);
    db.workSchedule.count.mockResolvedValue(1);

    const result = await new WorkforceService(db).schedules(membership, {
      page: 1,
      pageSize: 20,
    } as any);

    expect(result.data).toEqual([
      {
        id: 'schedule',
        code: 'STANDARD-5D',
        workingSchedule: schedule.scheduleDays,
      },
    ]);
    expect(result.data[0]).not.toHaveProperty('scheduleDays');
  });

  it('returns public-holiday status counts in pagination metadata', async () => {
    const db = database();
    db.publicHoliday.findMany.mockResolvedValue([]);
    db.publicHoliday.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);

    const result = await new WorkforceService(db).holidays(membership, {
      page: 1,
      pageSize: 20,
    } as any);

    expect(result.meta.summary?.statusCounts).toEqual({
      ACTIVE: 0,
      INACTIVE: 2,
    });
  });

  it('generates a company-scoped public-holiday code', async () => {
    const db = database();
    db.publicHoliday.findMany
      .mockResolvedValueOnce([{ code: 7 }])
      .mockResolvedValueOnce([]);
    db.publicHoliday.create.mockResolvedValue({
      id: 'holiday',
      code: 8,
    });

    const result = await new WorkforceService(db).createHoliday(membership, {
      name: 'New Year',
      startDate: '2027-01-01',
      endDate: '2027-01-01',
      scope: 'NATIONAL',
      regions: [],
      status: 'ACTIVE',
    } as any);

    expect(result).toEqual({
      data: { id: 'holiday', code: 8 },
    });
    expect(db.publicHoliday.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company',
        code: 8,
      }),
    });
  });

  it('deactivates a schedule only when no active employee uses it', async () => {
    const db = database();
    db.workSchedule.findUnique.mockResolvedValue({
      id: 'schedule',
      active: true,
    });
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

  it('reactivates an inactive schedule through the same endpoint behavior', async () => {
    const db = database();
    db.workSchedule.findUnique.mockResolvedValue({
      id: 'schedule',
      active: false,
    });
    db.workSchedule.update.mockResolvedValue({
      id: 'schedule',
      active: true,
    });

    await expect(
      new WorkforceService(db).deactivateSchedule(membership, 'schedule'),
    ).resolves.toEqual({ data: { id: 'schedule', active: true } });
    expect(db.employee.count).not.toHaveBeenCalled();
    expect(db.workSchedule.update).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'schedule' } },
      data: { active: true },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'SCHEDULE_ACTIVATED',
        resourceId: 'schedule',
      },
    });
  });
});
