import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail } from '../common/domain';
import {
  LocationDto,
  ScheduleDto,
  HolidayDto,
  AssignmentDto,
} from './workforce.dto';
import { PageDto, paginated } from '../common/page.dto';
@Injectable()
export class WorkforceService {
  constructor(private db: Database) {}
  async locations(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.workLocation.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { code: 'asc' },
      }),
      this.db.workLocation.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async schedules(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.workSchedule.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { code: 'asc' },
      }),
      this.db.workSchedule.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async holidays(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.publicHoliday.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { startDate: 'asc' },
      }),
      this.db.publicHoliday.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async createLocation(m: Membership, dto: LocationDto) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timezone });
    } catch {
      fail('INVALID_TIMEZONE', 'Unknown IANA timezone.', 400);
    }
    return this.db.$transaction(async (tx) => {
      const data = await tx.workLocation.create({
        data: { ...dto, companyId: m.companyId },
      });
      await audit(tx, m, 'LOCATION_CREATED', data.id);
      return { data };
    });
  }
  async createSchedule(m: Membership, dto: ScheduleDto) {
    const duration = (dto.endMinute - dto.startMinute + 1440) % 1440;
    if (!duration || dto.breakMinutes >= duration)
      fail('INVALID_SCHEDULE', 'Break must be shorter than a non-zero shift.');
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom)
      fail('INVALID_DATES', 'End date precedes start date.');
    return this.db.$transaction(async (tx) => {
      const data = await tx.workSchedule.create({
        data: {
          ...dto,
          companyId: m.companyId,
          effectiveFrom: dateOnly(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? dateOnly(dto.effectiveTo) : null,
        },
      });
      await audit(tx, m, 'SCHEDULE_CREATED', data.id);
      return { data };
    });
  }
  async createHoliday(m: Membership, dto: HolidayDto) {
    if (dto.endDate < dto.startDate)
      fail('INVALID_DATES', 'End date precedes start date.');
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
              !h.states.length ||
              !dto.states.length ||
              h.states.some((s) => dto.states.includes(s)),
          )
        )
          fail(
            'HOLIDAY_OVERLAP',
            'A holiday already covers this date and region.',
            409,
          );
        const data = await tx.publicHoliday.create({
          data: {
            ...dto,
            companyId: m.companyId,
            startDate: dateOnly(dto.startDate),
            endDate: dateOnly(dto.endDate),
          },
        });
        await audit(tx, m, 'HOLIDAY_CREATED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
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
