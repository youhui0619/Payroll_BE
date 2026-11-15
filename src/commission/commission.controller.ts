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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { DecisionDto } from '../common/domain';
import {
  CommissionRecordDto,
  CommissionRecordQueryDto,
  CommissionSettingDto,
  CommissionSettingQueryDto,
  UpdateCommissionSettingDto,
} from './commission.dto';
import { CommissionService } from './commission.service';

@ApiBearerAuth()
@ApiTags('commission')
@Controller('commission')
export class CommissionController {
  constructor(private service: CommissionService) {}

  @Get('settings')
  settings(@Req() r: TenantRequest, @Query() q: CommissionSettingQueryDto) {
    return this.service.listSettings(r.membership, q);
  }

  @Get('settings/:id')
  settingDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setting(r.membership, id);
  }

  @Post('settings')
  @Roles('OWNER', 'HR', 'FINANCE')
  createSetting(@Req() r: TenantRequest, @Body() d: CommissionSettingDto) {
    return this.service.createSetting(r.membership, d);
  }

  @Patch('settings/:id')
  @Roles('OWNER', 'HR', 'FINANCE')
  updateSetting(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateCommissionSettingDto,
  ) {
    return this.service.updateSetting(r.membership, id, d);
  }

  @Post('settings/:id/deactivate')
  @Roles('OWNER', 'HR', 'FINANCE')
  deactivateSetting(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateSetting(r.membership, id);
  }

  @Get('records/pending')
  @Roles('OWNER', 'HR', 'FINANCE')
  pendingRecords(
    @Req() r: TenantRequest,
    @Query() q: CommissionRecordQueryDto,
  ) {
    return this.service.listRecords(r.membership, q, true);
  }

  @Get('records')
  @Roles('OWNER', 'HR', 'FINANCE')
  records(@Req() r: TenantRequest, @Query() q: CommissionRecordQueryDto) {
    return this.service.listRecords(r.membership, q);
  }

  @Post('records')
  @Roles('OWNER', 'HR', 'FINANCE')
  createRecord(@Req() r: TenantRequest, @Body() d: CommissionRecordDto) {
    return this.service.createRecord(r.membership, d);
  }

  @Get('records/:id')
  @Roles('OWNER', 'HR', 'FINANCE')
  @ApiOperation({
    summary: 'Read a commission record and its calculation snapshot.',
  })
  recordDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.record(r.membership, id);
  }

  @Post('records/:id/decision')
  @Roles('OWNER', 'HR', 'FINANCE')
  decideRecord(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decideRecord(r.membership, id, d);
  }
}
