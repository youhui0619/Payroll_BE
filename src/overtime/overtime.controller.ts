import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantRequest } from '../auth/auth.decorators';
import { DecisionDto } from '../common/domain';
import {
  OvertimeDto,
  OvertimeQueryDto,
  UpdateOvertimeDto,
} from './overtime.dto';
import { OvertimeService } from './overtime.service';

@ApiBearerAuth()
@ApiTags('overtime')
@Controller('overtime')
export class OvertimeController {
  constructor(private service: OvertimeService) {}

  @Get('me')
  own(@Req() r: TenantRequest, @Query() q: OvertimeQueryDto) {
    return this.service.list(r.membership, q, 'own');
  }

  @Get('pending')
  pending(@Req() r: TenantRequest, @Query() q: OvertimeQueryDto) {
    return this.service.list(r.membership, q, 'pending');
  }

  @Get()
  all(@Req() r: TenantRequest, @Query() q: OvertimeQueryDto) {
    return this.service.list(r.membership, q, 'all');
  }

  @Post()
  create(@Req() r: TenantRequest, @Body() d: OvertimeDto) {
    return this.service.create(r.membership, d);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read an overtime request and supporting documents.',
  })
  detail(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(r.membership, id);
  }

  @Put(':id')
  edit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateOvertimeDto,
  ) {
    return this.service.edit(r.membership, id, d);
  }

  @Post(':id/submit')
  submit(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.submit(r.membership, id);
  }

  @Post(':id/decision')
  decide(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decide(r.membership, id, d);
  }

  @Post(':id/cancel')
  cancel(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(r.membership, id);
  }
}
