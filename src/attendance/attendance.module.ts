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
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { Membership } from '@prisma/client';
import { audit, dateOnly, fail, selfEmployee } from '../common/domain';
import { DateRangeDto } from '../workforce/workforce.dto';

export class ClockDto {
  @ApiProperty({
    description: 'Reuse the same UUID when retrying a clock command.',
  })
  @IsUUID()
  idempotencyKey: string;
}
@Injectable()
export class AttendanceService {
  constructor(private db: Database) {}
  async clock(m: Membership, key: string, direction: 'IN' | 'OUT') {
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
        const data =
          direction === 'IN'
            ? await tx.attendanceSession.create({
                data: { ...where, clockIn: now, clockInKey: key },
              })
            : await tx.attendanceSession.update({
                where: { id: open.id },
                data: { clockOut: now, clockOutKey: key },
              });
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
        clockIn: { lt: new Date(end.getTime() + 86400000) },
        OR: [{ clockOut: null }, { clockOut: { gte: start } }],
      },
      orderBy: { clockIn: 'desc' },
      take: 1000,
    });
    return {
      data: rows.map((row) => ({
        ...row,
        workedMinutes: row.clockOut
          ? Math.floor((row.clockOut.getTime() - row.clockIn.getTime()) / 60000)
          : null,
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
  @Post('clock-out') clockOut(@Req() r: TenantRequest, @Body() d: ClockDto) {
    return this.service.clock(r.membership, d.idempotencyKey, 'OUT');
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
