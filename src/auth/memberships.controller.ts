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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageDto } from '../common/page.dto';
import { Roles, TenantRequest } from './auth.decorators';
import { CreateMemberDto, UpdateMemberDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';

@ApiBearerAuth()
@ApiTags('memberships')
@Roles('OWNER')
@Controller('memberships')
export class MembershipsController {
  constructor(private service: MembershipsService) {}
  @Get() list(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: CreateMemberDto) {
    return this.service.create(r.membership, d);
  }
  @Patch(':id') update(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateMemberDto,
  ) {
    return this.service.update(r.membership, id, d);
  }
}
