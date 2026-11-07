import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.module';
import { PageDto } from '../common/page.dto';
import {
  LocationDto,
  ScheduleDto,
  HolidayDto,
  AssignmentDto,
} from './workforce.dto';
import { WorkforceService } from './workforce.service';
@ApiBearerAuth()
@ApiTags('workforce-settings')
@Roles('OWNER', 'HR')
@Controller()
export class WorkforceController {
  constructor(private service: WorkforceService) {}
  @Get('work-locations') locations(
    @Req() r: TenantRequest,
    @Query() q: PageDto,
  ) {
    return this.service.locations(r.membership, q);
  }
  @Post('work-locations') location(
    @Req() r: TenantRequest,
    @Body() d: LocationDto,
  ) {
    return this.service.createLocation(r.membership, d);
  }
  @Get('work-schedules') schedules(
    @Req() r: TenantRequest,
    @Query() q: PageDto,
  ) {
    return this.service.schedules(r.membership, q);
  }
  @Post('work-schedules') schedule(
    @Req() r: TenantRequest,
    @Body() d: ScheduleDto,
  ) {
    return this.service.createSchedule(r.membership, d);
  }
  @Get('public-holidays') holidays(
    @Req() r: TenantRequest,
    @Query() q: PageDto,
  ) {
    return this.service.holidays(r.membership, q);
  }
  @Post('public-holidays') holiday(
    @Req() r: TenantRequest,
    @Body() d: HolidayDto,
  ) {
    return this.service.createHoliday(r.membership, d);
  }
  @Patch('employees/:id/assignment') assign(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AssignmentDto,
  ) {
    return this.service.assign(r.membership, id, d);
  }
}
@Module({ controllers: [WorkforceController], providers: [WorkforceService] })
export class WorkforceModule {}
