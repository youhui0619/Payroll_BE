import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import {
  NotificationSettingsDto,
  PayslipSettingsDto,
  RegionalSettingsDto,
} from './settings.dto';
import { SettingsService } from './settings.service';

@ApiBearerAuth()
@ApiTags('settings')
@Roles('OWNER', 'HR')
@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get('notifications') notifications(@Req() r: TenantRequest) {
    return this.service.notifications(r.membership);
  }

  @Patch('notifications') updateNotifications(
    @Req() r: TenantRequest,
    @Body() dto: NotificationSettingsDto,
  ) {
    return this.service.updateNotifications(r.membership, dto);
  }

  @Get('regional') regional(@Req() r: TenantRequest) {
    return this.service.regional(r.membership);
  }

  @Patch('regional') updateRegional(
    @Req() r: TenantRequest,
    @Body() dto: RegionalSettingsDto,
  ) {
    return this.service.updateRegional(r.membership, dto);
  }

  @Get('payslip') payslip(@Req() r: TenantRequest) {
    return this.service.payslip(r.membership);
  }

  @Patch('payslip') updatePayslip(
    @Req() r: TenantRequest,
    @Body() dto: PayslipSettingsDto,
  ) {
    return this.service.updatePayslip(r.membership, dto);
  }
}
