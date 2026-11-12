import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { Membership } from '@prisma/client';
import {
  audit,
  dateOnly,
  fail,
  localDate,
  selfEmployee,
} from '../common/domain';
import { DateRangeDto } from '../workforce/workforce.dto';

export class ClockDto {
  @ApiProperty({
    description: 'Reuse the same UUID when retrying a clock command.',
  })
  @IsUUID()
  idempotencyKey: string;
}
export class ClockOutDto extends ClockDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  remark?: string;
}
@Injectable()
export class AttendanceService {
  constructor(private db: Database) {}
  async clock(
    m: Membership,
    key: string,
    direction: 'IN' | 'OUT',
    remark?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await selfEmployee(tx, m);
        const where = { companyId: m.companyId, employeeId: employee.id };
        const replay = await tx.attendanceSession.findFirst({
          where: {
            ...where,
            ...(direction === 'IN'
              ? { clockInKey: key }
              : { clockOutKey: key }),
          },
        });
        if (replay) return { data: replay };
        const open = await tx.attendanceSession.findFirst({
          where: { ...where, clockOut: null },
        });
        if (direction === 'IN' && open)
          fail(
            'ALREADY_CLOCKED_IN',
            'Clock out before starting another session.',
            409,
          );
        if (direction === 'OUT' && !open)
          fail('NOT_CLOCKED_IN', 'There is no open attendance session.', 409);
        const now = new Date();
        const company = await tx.company.findUniqueOrThrow({
          where: { id: m.companyId },
        });
        const data =
          direction === 'IN'
            ? await tx.attendanceSession.create({
                data: {
                  ...where,
                  date: dateOnly(localDate(now, company.timezone)),
                  clockIn: now,
                  clockInKey: key,
                },
              })
            : await (async () => {
                const durationMinutes = Math.max(
                  0,
                  Math.floor((now.getTime() - open.clockIn.getTime()) / 60000),
                );
                const schedule = employee.scheduleId
                  ? await tx.workSchedule.findFirst({
                      where: {
                        id: employee.scheduleId,
                        companyId: m.companyId,
                        active: true,
                      },
                    })
                  : null;
                const hoursWorkedMinutes = schedule
                  ? Math.max(0, durationMinutes - schedule.breakMinutes)
                  : durationMinutes;
                const scheduledMinutes = schedule
                  ? Math.max(
                      0,
                      ((schedule.endMinute - schedule.startMinute + 1440) %
                        1440 || 1440) - schedule.breakMinutes,
                    )
                  : 0;
                const overtimeMinutes = schedule
                  ? Math.max(0, hoursWorkedMinutes - scheduledMinutes)
                  : 0;
                return tx.attendanceSession.update({
                  where: { id: open.id },
                  data: {
                    clockOut: now,
                    clockOutKey: key,
                    durationMinutes,
                    hoursWorkedMinutes,
                    overtimeMinutes,
                    ...(remark !== undefined
                      ? { remark: remark.trim() || null }
                      : {}),
                  },
                });
              })();
        await audit(
          tx,
          m,
          direction === 'IN' ? 'CLOCK_IN' : 'CLOCK_OUT',
          data.id,
        );
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async status(m: Membership) {
    const employee = await selfEmployee(this.db, m);
    return {
      data: await this.db.attendanceSession.findFirst({
        where: {
          companyId: m.companyId,
          employeeId: employee.id,
          clockOut: null,
        },
      }),
    };
  }
  async history(m: Membership, q: DateRangeDto, all = false) {
    const start = dateOnly(q.from),
      end = dateOnly(q.to);
    if (end < start || end.getTime() - start.getTime() > 31 * 86400000)
      fail('INVALID_RANGE', 'Use a date range of at most 32 days.', 400);
    const employeeId = all ? undefined : (await selfEmployee(this.db, m)).id;
    // UTC interval; sessions overlapping it are returned, including overnight shifts.
    const rows = await this.db.attendanceSession.findMany({
      where: {
        companyId: m.companyId,
        employeeId,
        date: { gte: start, lte: end },
      },
      orderBy: { clockIn: 'desc' },
      take: 1000,
    });
    return {
      data: rows.map((row) => ({
        ...row,
        durationMinutes: row.durationMinutes,
        hoursWorkedMinutes: row.hoursWorkedMinutes,
        overtimeMinutes: row.overtimeMinutes,
        remark: row.remark,
        workedMinutes: row.durationMinutes,
      })),
      meta: { limit: 1000 },
    };
  }
}
@ApiBearerAuth()
@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private service: AttendanceService) {}
  @Post('clock-in') clockIn(@Req() r: TenantRequest, @Body() d: ClockDto) {
    return this.service.clock(r.membership, d.idempotencyKey, 'IN');
  }
  @Post('clock-out') clockOut(@Req() r: TenantRequest, @Body() d: ClockOutDto) {
    return this.service.clock(r.membership, d.idempotencyKey, 'OUT', d.remark);
  }
  @Get('me/status') status(@Req() r: TenantRequest) {
    return this.service.status(r.membership);
  }
  @Get('me/history') history(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
  ) {
    return this.service.history(r.membership, q);
  }
  @Get() @Roles('OWNER', 'HR') all(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
  ) {
    return this.service.history(r.membership, q, true);
  }
}
@Module({ controllers: [AttendanceController], providers: [AttendanceService] })
export class AttendanceModule {}
