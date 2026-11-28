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

  it('returns working schedules keyed by employment type using the FE shape', async () => {
    const db = database();
    const permanentSchedule = {
      id: 'schedule',
      code: 'STANDARD-5D',
      employmentType: 'PERMANENT',
      effectiveFrom: new Date('2026-01-01'),
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
    const partTimeSchedule = {
      id: 'part-time-schedule',
      code: 'PART-TIME-4H',
      employmentType: 'PART-TIME',
      effectiveFrom: new Date('2026-01-01'),
      scheduleDays: {
        days: [
          {
            day: 'Monday',
            isWorkingDay: true,
            startTime: '09:00',
            endTime: '13:00',
            breakStartTime: '',
            breakEndTime: '',
          },
        ],
      },
    };
    db.workSchedule.findMany.mockResolvedValue([
      partTimeSchedule,
      permanentSchedule,
    ]);

    const result = await new WorkforceService(db).schedules(membership, {
      page: 1,
      pageSize: 20,
    } as any);

    expect(result).toEqual({
      data: {
        PERMANENT: permanentSchedule.scheduleDays,
        'PART-TIME': partTimeSchedule.scheduleDays,
      },
    });
    expect(result.data).not.toHaveProperty('scheduleDays');
    expect(db.workSchedule.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company', active: true },
      orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    });
  });

  it('returns public-holiday status counts in pagination metadata', async () => {
    const db = database();
    db.publicHoliday.findMany.mockResolvedValue([
      {
        id: 'holiday',
        active: false,
        states: ['JOHOR'],
        regions: ['JOHOR'],
      },
    ]);
    db.publicHoliday.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);

    const result = await new WorkforceService(db).holidays(membership, {
      page: 1,
      pageSize: 20,
      active: false,
    } as any);

    expect(db.publicHoliday.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ active: false }),
      skip: 0,
      take: 20,
      orderBy: { startDate: 'asc' },
    });
    expect(result.meta.summary?.statusCounts).toEqual({
      ACTIVE: 0,
      INACTIVE: 2,
    });
    expect(result.data[0]).toEqual({
      id: 'holiday',
      active: false,
      regions: ['JOHOR'],
    });
  });

  it('updates working schedule days by employment type using the FE shape', async () => {
    const db = database();
    const scheduleDays = {
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
    };
    db.workSchedule.findFirst.mockResolvedValue({
      id: 'part-time-schedule',
      employmentType: 'PART-TIME',
      code: 'PART-TIME-4H',
      effectiveFrom: new Date('2026-01-01'),
    });
    db.workSchedule.update.mockResolvedValue({
      id: 'part-time-schedule',
      employmentType: 'PART-TIME',
      scheduleDays,
    });

    const result = await new WorkforceService(db).updateSchedule(
      membership,
      'PART-TIME',
      scheduleDays as any,
    );

    expect(result).toEqual({ data: { 'PART-TIME': scheduleDays } });
    expect(db.workSchedule.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company', employmentType: 'PART-TIME' },
      orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    });
    expect(db.workSchedule.update).toHaveBeenCalledWith({
      where: {
        companyId_id: { companyId: 'company', id: 'part-time-schedule' },
      },
      data: { scheduleDays },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'SCHEDULE_UPDATED',
        resourceId: 'part-time-schedule',
      },
    });
  });

  it('updates multiple working schedules by employment type in one transaction', async () => {
    const db = database();
    const permanent = {
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
    };
    const partTime = {
      days: [
        {
          day: 'Monday',
          isWorkingDay: true,
          startTime: '09:00',
          endTime: '13:00',
          breakStartTime: '',
          breakEndTime: '',
        },
      ],
    };
    db.workSchedule.findMany.mockResolvedValue([
      {
        id: 'permanent-schedule',
        employmentType: 'PERMANENT',
        code: 'STANDARD-5D',
        effectiveFrom: new Date('2026-01-01'),
      },
      {
        id: 'part-time-schedule',
        employmentType: 'PART-TIME',
        code: 'PART-TIME-4H',
        effectiveFrom: new Date('2026-01-01'),
      },
    ]);
    db.workSchedule.update
      .mockResolvedValueOnce({
        id: 'permanent-schedule',
        employmentType: 'PERMANENT',
        scheduleDays: permanent,
      })
      .mockResolvedValueOnce({
        id: 'part-time-schedule',
        employmentType: 'PART-TIME',
        scheduleDays: partTime,
      });

    const result = await new WorkforceService(db).updateSchedules(membership, {
      PERMANENT: permanent,
      'PART-TIME': partTime,
    } as any);

    expect(result).toEqual({
      data: { PERMANENT: permanent, 'PART-TIME': partTime },
    });
    expect(db.workSchedule.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company',
        employmentType: { in: ['PERMANENT', 'PART-TIME'] },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    });
    expect(db.workSchedule.update).toHaveBeenNthCalledWith(1, {
      where: {
        companyId_id: { companyId: 'company', id: 'permanent-schedule' },
      },
      data: { scheduleDays: permanent },
    });
    expect(db.workSchedule.update).toHaveBeenNthCalledWith(2, {
      where: {
        companyId_id: { companyId: 'company', id: 'part-time-schedule' },
      },
      data: { scheduleDays: partTime },
    });
    expect(db.auditEvent.create).toHaveBeenCalledTimes(2);
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

  it('normalizes a FE national holiday payload and persists isActive', async () => {
    const db = database();
    db.publicHoliday.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    db.publicHoliday.create.mockResolvedValue({
      id: 'holiday',
      code: 1,
      scope: 'NATIONAL',
      active: true,
    });

    await new WorkforceService(db).createHoliday(membership, {
      name: 'Malaysia Day',
      description: 'Malaysia Day',
      scope: 'State',
      regions: [],
      startDate: '2026-09-16',
      endDate: '2026-09-16',
      active: true,
    } as any);

    expect(db.publicHoliday.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'NATIONAL',
        states: [],
        regions: [],
        active: true,
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
