import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
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
} from './workforce.dto';
import {
  WorkingScheduleDto,
  WorkingScheduleMapDto,
  WorkingScheduleMapResponseDto,
} from './working-schedule.dto';
import { WorkforceService } from './workforce.service';
import { EMPLOYMENT_TYPES } from './employment-types';

@ApiBearerAuth()
@ApiTags('workforce-settings')
@Roles('OWNER', 'HR')
@Controller()
export class WorkforceController {
  constructor(private service: WorkforceService) {}
  @Get('employment-types') employmentTypes() {
    return { data: EMPLOYMENT_TYPES };
  }

  @Get('work-locations') locations(
    @Req() r: TenantRequest,
    @Query() q: LocationQueryDto,
  ) {
    return this.service.locations(r.membership, q);
  }
  @Get('work-locations/:id') locationDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.location(r.membership, id);
  }
  @Post('work-locations') location(
    @Req() r: TenantRequest,
    @Body() d: LocationDto,
  ) {
    return this.service.createLocation(r.membership, d);
  }
  @Patch('work-locations/:id') updateLocation(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateLocationDto,
  ) {
    return this.service.updateLocation(r.membership, id, d);
  }
  @Post('work-locations/:id/deactivate') deactivateLocation(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateLocation(r.membership, id);
  }
  @Get('work-schedules')
  @ApiOkResponse({ type: WorkingScheduleMapResponseDto })
  schedules(@Req() r: TenantRequest, @Query() q: ScheduleQueryDto) {
    return this.service.schedules(r.membership, q);
  }
  @Get('work-schedules/:id') scheduleDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.schedule(r.membership, id);
  }
  @Post('work-schedules') schedule(
    @Req() r: TenantRequest,
    @Body() d: ScheduleDto,
  ) {
    return this.service.createSchedule(r.membership, d);
  }
  @Patch('work-schedules')
  @ApiOkResponse({ type: WorkingScheduleMapResponseDto })
  updateSchedules(@Req() r: TenantRequest, @Body() d: WorkingScheduleMapDto) {
    return this.service.updateSchedules(r.membership, d);
  }
  @Patch('work-schedules/:employmentType')
  @ApiOkResponse({ type: WorkingScheduleMapResponseDto })
  updateSchedule(
    @Req() r: TenantRequest,
    @Param('employmentType') employmentType: string,
    @Body() d: WorkingScheduleDto,
  ) {
    return this.service.updateSchedule(r.membership, employmentType, d);
  }
  @Post('work-schedules/:id/deactivate') deactivateSchedule(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateSchedule(r.membership, id);
  }
  @Get('public-holidays') holidays(
    @Req() r: TenantRequest,
    @Query() q: HolidayQueryDto,
  ) {
    return this.service.holidays(r.membership, q);
  }
  @Get('public-holidays/:id') holidayDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.holiday(r.membership, id);
  }
  @Post('public-holidays') holiday(
    @Req() r: TenantRequest,
    @Body() d: HolidayDto,
  ) {
    return this.service.createHoliday(r.membership, d);
  }
  @Patch('public-holidays/:id') updateHoliday(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateHolidayDto,
  ) {
    return this.service.updateHoliday(r.membership, id, d);
  }
  @Post('public-holidays/:id/deactivate') deactivateHoliday(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateHoliday(r.membership, id);
  }
  @Patch('employees/:id/assignment') assign(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AssignmentDto,
  ) {
    return this.service.assign(r.membership, id, d);
  }
}
