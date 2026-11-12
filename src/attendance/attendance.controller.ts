import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { DateRangeDto } from '../workforce/workforce.dto';
import { ClockDto, ClockOutDto } from './attendance.dto';
import { AttendanceService } from './attendance.service';

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
