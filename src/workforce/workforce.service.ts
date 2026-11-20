import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, dateString, fail } from '../common/domain';
import {
  HolidayQueryDto,
  LocationDto,
  LocationQueryDto,
  ScheduleDto,
  ScheduleQueryDto,
  HolidayDto,
  AssignmentDto,
  UpdateHolidayDto,
  UpdateLocationDto,
  UpdateScheduleDto,
} from './workforce.dto';
import { paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import { toWorkingScheduleResponse } from './working-schedule.mapper';

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    fail('INVALID_TIMEZONE', 'Unknown IANA timezone.', 400);
  }
}

function validateSchedule(
  startMinute: number,
  endMinute: number,
  breakMinutes: number,
) {
  const duration = (endMinute - startMinute + 1440) % 1440;
  if (!duration || breakMinutes >= duration)
    fail('INVALID_SCHEDULE', 'Break must be shorter than a non-zero shift.');
}

@Injectable()
export class WorkforceService {
  constructor(private db: Database) {}
  async locations(m: Membership, q: LocationQueryDto) {
    const search = q.search?.trim();
    const state = q.state?.trim().toUpperCase();
    const baseWhere = {
      companyId: m.companyId,
      ...(q.type ? { type: q.type } : {}),
      ...(state ? { state } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { remark: { contains: search, mode: 'insensitive' as const } },
              { city: { contains: search, mode: 'insensitive' as const } },
              { state: { contains: search, mode: 'insensitive' as const } },
              { country: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.active !== undefined ? { active: q.active } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.workLocation.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { code: 'asc' },
      }),
      this.db.workLocation.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.workLocation.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async location(m: Membership, id: string) {
    const data = await this.db.workLocation.findFirst({
      where: { id, companyId: m.companyId },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async schedules(m: Membership, q: ScheduleQueryDto) {
    const search = q.search?.trim();
    const baseWhere = {
      companyId: m.companyId,
      ...(q.employmentType ? { employmentType: q.employmentType } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.active !== undefined ? { active: q.active } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.workSchedule.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { code: 'asc' },
      }),
      this.db.workSchedule.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.workSchedule.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data.map(toWorkingScheduleResponse), total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async schedule(m: Membership, id: string) {
    const data = await this.db.workSchedule.findFirst({
      where: { id, companyId: m.companyId },
    });
    if (!data) throw new NotFoundException();
    return { data: toWorkingScheduleResponse(data) };
  }
  async holidays(m: Membership, q: HolidayQueryDto) {
    const search = q.search?.trim();
    const yearStart = q.year ? dateOnly(`${q.year}-01-01`) : undefined;
    const yearEnd = q.year ? dateOnly(`${q.year}-12-31`) : undefined;
    const baseWhere = {
      companyId: m.companyId,
      ...(q.scope ? { scope: q.scope } : {}),
      ...(q.region
        ? {
            OR: [{ regions: { has: q.region } }, { states: { has: q.region } }],
          }
        : {}),
      ...(yearStart && yearEnd
        ? { startDate: { lte: yearEnd }, endDate: { gte: yearStart } }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  {
                    description: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.status ? { status: q.status } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.publicHoliday.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { startDate: 'asc' },
      }),
      this.db.publicHoliday.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.publicHoliday.count({
          where: { ...baseWhere, status },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async holiday(m: Membership, id: string) {
    const data = await this.db.publicHoliday.findFirst({
      where: { id, companyId: m.companyId },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async createLocation(m: Membership, dto: LocationDto) {
    validateTimezone(dto.timezone);
    return this.db.$transaction(async (tx) => {
      const data = await tx.workLocation.create({
        data: {
          ...dto,
          state: dto.state.trim().toUpperCase(),
          companyId: m.companyId,
        },
      });
      await audit(tx, m, 'LOCATION_CREATED', data.id);
      return { data };
    });
  }
  async updateLocation(m: Membership, id: string, dto: UpdateLocationDto) {
    if (dto.timezone !== undefined) validateTimezone(dto.timezone);
    const existing = await this.db.workLocation.findFirst({
      where: { id, companyId: m.companyId },
    });
    if (!existing) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const data = await tx.workLocation.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: {
          ...dto,
          ...(dto.state !== undefined
            ? { state: dto.state.trim().toUpperCase() }
            : {}),
        },
      });
      await audit(tx, m, 'LOCATION_UPDATED', id);
      return { data };
    });
  }
  async deactivateLocation(m: Membership, id: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.workLocation.findUnique({
        where: { companyId_id: { companyId: m.companyId, id } },
      });
      if (!existing) throw new NotFoundException();
      const employees = await tx.employee.count({
        where: { companyId: m.companyId, locationId: id, active: true },
      });
      if (employees)
        fail(
          'LOCATION_IN_USE',
          'Reassign active employees before deactivating this location.',
          409,
        );
      const data = await tx.workLocation.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: { active: false },
      });
      await audit(tx, m, 'LOCATION_DEACTIVATED', id);
      return { data };
    });
  }
  async createSchedule(m: Membership, dto: ScheduleDto) {
    validateSchedule(dto.startMinute, dto.endMinute, dto.breakMinutes);
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom)
      fail('INVALID_DATES', 'End date precedes start date.');
    return this.db.$transaction(async (tx) => {
      const {
        effectiveFrom,
        effectiveTo,
        scheduleDays,
        workingSchedule,
        ...rest
      } = dto;
      const scheduleDaysValue = workingSchedule ?? scheduleDays;
      const data = await tx.workSchedule.create({
        data: {
          ...rest,
          companyId: m.companyId,
          ...(scheduleDaysValue !== undefined
            ? { scheduleDays: scheduleDaysValue as Prisma.InputJsonValue }
            : {}),
          effectiveFrom: dateOnly(effectiveFrom),
          effectiveTo: effectiveTo ? dateOnly(effectiveTo) : null,
        },
      });
      await audit(tx, m, 'SCHEDULE_CREATED', data.id);
      return { data: toWorkingScheduleResponse(data) };
    });
  }
  async updateSchedule(m: Membership, id: string, dto: UpdateScheduleDto) {
    const existing = await this.db.workSchedule.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!existing) throw new NotFoundException();
    const startMinute = dto.startMinute ?? existing.startMinute;
    const endMinute = dto.endMinute ?? existing.endMinute;
    const breakMinutes = dto.breakMinutes ?? existing.breakMinutes;
    validateSchedule(startMinute, endMinute, breakMinutes);
    const effectiveFrom =
      dto.effectiveFrom ?? dateString(existing.effectiveFrom);
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
        : existing.effectiveTo
          ? dateString(existing.effectiveTo)
          : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom)
      fail('INVALID_DATES', 'End date precedes start date.');
    const {
      effectiveFrom: from,
      effectiveTo: to,
      scheduleDays,
      workingSchedule,
      ...rest
    } = dto;
    const scheduleDaysValue = workingSchedule ?? scheduleDays;
    return this.db.$transaction(async (tx) => {
      const data = await tx.workSchedule.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: {
          ...rest,
          ...(scheduleDaysValue !== undefined
            ? { scheduleDays: scheduleDaysValue as Prisma.InputJsonValue }
            : {}),
          ...(from !== undefined ? { effectiveFrom: dateOnly(from) } : {}),
          ...(to !== undefined
            ? { effectiveTo: to ? dateOnly(to) : null }
            : {}),
        },
      });
      await audit(tx, m, 'SCHEDULE_UPDATED', id);
      return { data: toWorkingScheduleResponse(data) };
    });
  }
  async deactivateSchedule(m: Membership, id: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.workSchedule.findUnique({
        where: { companyId_id: { companyId: m.companyId, id } },
      });
      if (!existing) throw new NotFoundException();
      const employees = await tx.employee.count({
        where: { companyId: m.companyId, scheduleId: id, active: true },
      });
      if (employees)
        fail(
          'SCHEDULE_IN_USE',
          'Reassign active employees before deactivating this schedule.',
          409,
        );
      const data = await tx.workSchedule.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: { active: false },
      });
      await audit(tx, m, 'SCHEDULE_DEACTIVATED', id);
      return { data };
    });
  }
  async createHoliday(m: Membership, dto: HolidayDto) {
    if (dto.endDate < dto.startDate)
      fail('INVALID_DATES', 'End date precedes start date.');
    const regions = dto.regions ?? dto.states ?? [];
    const status = dto.status ?? 'ACTIVE';
    const scope = dto.scope ?? 'NATIONAL';
    return this.db.$transaction(
      async (tx) => {
        const overlaps = await tx.publicHoliday.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            startDate: { lte: dateOnly(dto.endDate) },
            endDate: { gte: dateOnly(dto.startDate) },
          },
        });
        if (
          overlaps.some(
            (h) =>
              !(h.regions?.length ? h.regions : h.states).length ||
              !regions.length ||
              (h.regions?.length ? h.regions : h.states).some((s) =>
                regions.includes(s),
              ),
          )
        )
          fail(
            'HOLIDAY_OVERLAP',
            'A holiday already covers this date and region.',
            409,
          );
        const data = await tx.publicHoliday.create({
          data: {
            companyId: m.companyId,
            name: dto.name,
            description: dto.description,
            scope,
            startDate: dateOnly(dto.startDate),
            endDate: dateOnly(dto.endDate),
            states: regions,
            regions,
            active: status === 'ACTIVE',
            status,
          },
        });
        await audit(tx, m, 'HOLIDAY_CREATED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async updateHoliday(m: Membership, id: string, dto: UpdateHolidayDto) {
    const existing = await this.db.publicHoliday.findFirst({
      where: { companyId: m.companyId, id },
    });
    if (!existing) throw new NotFoundException();
    const startDate = dto.startDate ?? dateString(existing.startDate);
    const endDate = dto.endDate ?? dateString(existing.endDate);
    if (endDate < startDate)
      fail('INVALID_DATES', 'End date precedes start date.');
    const regions =
      dto.regions ??
      dto.states ??
      (existing.regions?.length ? existing.regions : existing.states);
    const status = dto.status ?? (existing.status as 'ACTIVE' | 'INACTIVE');
    return this.db.$transaction(
      async (tx) => {
        const overlaps = await tx.publicHoliday.findMany({
          where: {
            companyId: m.companyId,
            id: { not: id },
            active: true,
            startDate: { lte: dateOnly(endDate) },
            endDate: { gte: dateOnly(startDate) },
          },
        });
        if (
          status === 'ACTIVE' &&
          overlaps.some(
            (h) =>
              !(h.regions?.length ? h.regions : h.states).length ||
              !regions.length ||
              (h.regions?.length ? h.regions : h.states).some((s) =>
                regions.includes(s),
              ),
          )
        )
          fail(
            'HOLIDAY_OVERLAP',
            'A holiday already covers this date and region.',
            409,
          );
        const {
          startDate: from,
          endDate: to,
          states: ignoredStates,
          regions: ignoredRegions,
          scope,
          status: ignoredStatus,
          ...rest
        } = dto;
        void ignoredStates;
        void ignoredRegions;
        void ignoredStatus;
        const data = await tx.publicHoliday.update({
          where: { id },
          data: {
            ...rest,
            ...(from !== undefined ? { startDate: dateOnly(from) } : {}),
            ...(to !== undefined ? { endDate: dateOnly(to) } : {}),
            ...(scope !== undefined ? { scope } : {}),
            ...(dto.regions !== undefined || dto.states !== undefined
              ? { states: regions, regions }
              : {}),
            ...(dto.status !== undefined
              ? { status, active: status === 'ACTIVE' }
              : {}),
          },
        });
        await audit(tx, m, 'HOLIDAY_UPDATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async deactivateHoliday(m: Membership, id: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.publicHoliday.findFirst({
        where: { companyId: m.companyId, id },
      });
      if (!existing) throw new NotFoundException();
      const data = await tx.publicHoliday.update({
        where: { id },
        data: { active: false, status: 'INACTIVE' },
      });
      await audit(tx, m, 'HOLIDAY_DEACTIVATED', id);
      return { data };
    });
  }
  async assign(m: Membership, id: string, dto: AssignmentDto) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!employee) throw new NotFoundException();
        if (
          dto.locationId &&
          !(await tx.workLocation.findFirst({
            where: { id: dto.locationId, companyId: m.companyId, active: true },
          }))
        )
          throw new NotFoundException('Location not found.');
        if (
          dto.scheduleId &&
          !(await tx.workSchedule.findFirst({
            where: { id: dto.scheduleId, companyId: m.companyId, active: true },
          }))
        )
          throw new NotFoundException('Schedule not found.');
        const seen = new Set([id]);
        let managerId = dto.managerId;
        while (managerId) {
          if (seen.has(managerId))
            fail(
              'MANAGER_CYCLE',
              'Reporting hierarchy cannot contain a cycle.',
            );
          seen.add(managerId);
          const manager = await tx.employee.findFirst({
            where: { id: managerId, companyId: m.companyId, active: true },
          });
          if (!manager) throw new NotFoundException('Manager not found.');
          managerId = manager.managerId;
        }
        const data = await tx.employee.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: dto,
        });
        await audit(tx, m, 'ASSIGNMENT_UPDATED', id);
        return { data };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
