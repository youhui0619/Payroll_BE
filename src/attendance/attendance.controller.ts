import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { DateRangeDto } from '../workforce/workforce.dto';
import {
  AttendanceAdjustmentDto,
  AttendanceAdjustmentQueryDto,
  AttendanceCorrectionDto,
  AttendanceCalendarQueryDto,
  ClockDto,
  ClockOutDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';
import { AttendanceAdjustmentsService } from './attendance-adjustments.service';
import { DecisionDto } from '../common/domain';

@ApiBearerAuth()
@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private service: AttendanceService,
    private adjustments: AttendanceAdjustmentsService,
  ) {}
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
  @Get('me/calendar') calendarMe(
    @Req() r: TenantRequest,
    @Query() q: AttendanceCalendarQueryDto,
  ) {
    return this.service.calendar(r.membership, q);
  }
  @Get('employees/:employeeId/calendar')
  @Roles('OWNER', 'HR')
  employeeCalendar(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() q: AttendanceCalendarQueryDto,
  ) {
    return this.service.employeeCalendar(r.membership, employeeId, q);
  }
  @Get('calendar') @Roles('OWNER', 'HR') calendar(
    @Req() r: TenantRequest,
    @Query() q: AttendanceCalendarQueryDto,
  ) {
    return this.service.calendar(r.membership, q, true);
  }
  @Get() @Roles('OWNER', 'HR') all(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
  ) {
    return this.service.history(r.membership, q, true);
  }

  @Post('adjustments')
  createAdjustment(
    @Req() r: TenantRequest,
    @Body() d: AttendanceAdjustmentDto,
  ) {
    return this.adjustments.create(r.membership, d);
  }

  @Get('me/adjustments')
  ownAdjustments(
    @Req() r: TenantRequest,
    @Query() q: AttendanceAdjustmentQueryDto,
  ) {
    return this.adjustments.list(r.membership, q, true);
  }

  @Get('adjustments/pending')
  @Roles('OWNER', 'HR')
  pendingAdjustments(
    @Req() r: TenantRequest,
    @Query() q: AttendanceAdjustmentQueryDto,
  ) {
    return this.adjustments.pending(r.membership, q);
  }

  @Get('adjustments')
  @Roles('OWNER', 'HR')
  allAdjustments(
    @Req() r: TenantRequest,
    @Query() q: AttendanceAdjustmentQueryDto,
  ) {
    return this.adjustments.list(r.membership, q);
  }

  @Get('adjustments/:id')
  detailAdjustment(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adjustments.detail(r.membership, id);
  }

  @Post('adjustments/:id/decision')
  decideAdjustment(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.adjustments.decide(r.membership, id, d);
  }

  @Post('adjustments/correct')
  @Roles('OWNER', 'HR')
  correctAdjustment(
    @Req() r: TenantRequest,
    @Body() d: AttendanceCorrectionDto,
  ) {
    return this.adjustments.correct(r.membership, d);
  }
}
