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
  CompanyDto,
  DepartmentDto,
  PositionDto,
  UpdateDepartmentDto,
  UpdatePositionDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@ApiBearerAuth()
@ApiTags('company')
@Roles('OWNER', 'HR')
@Controller('company')
export class CompanyController {
  constructor(private service: OrganizationService) {}
  @Get() get(@Req() req: TenantRequest) {
    return this.service.company(req.membership.companyId);
  }
  @Patch() @Roles('OWNER') update(
    @Req() req: TenantRequest,
    @Body() dto: CompanyDto,
  ) {
    return this.service.updateCompany(req.membership.companyId, dto);
  }
}
@ApiBearerAuth()
@ApiTags('departments')
@Roles('OWNER', 'HR')
@Controller('departments')
export class DepartmentController {
  constructor(private service: OrganizationService) {}
  @Get() list(@Req() req: TenantRequest, @Query() q: PageDto) {
    return this.service.departments(req.membership.companyId, q);
  }
  @Get(':id') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.department(req.membership.companyId, id);
  }
  @Post() create(@Req() req: TenantRequest, @Body() dto: DepartmentDto) {
    return this.service.createDepartment(req.membership.companyId, dto);
  }
  @Patch(':id') update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.service.updateDepartment(req.membership.companyId, id, dto);
  }
  @Post(':id/deactivate') deactivate(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivate(req.membership.companyId, id, 'department');
  }
}
@ApiBearerAuth()
@ApiTags('positions')
@Roles('OWNER', 'HR')
@Controller('positions')
export class PositionController {
  constructor(private service: OrganizationService) {}
  @Get() list(@Req() req: TenantRequest, @Query() q: PageDto) {
    return this.service.positions(req.membership.companyId, q);
  }
  @Post() create(@Req() req: TenantRequest, @Body() dto: PositionDto) {
    return this.service.createPosition(req.membership.companyId, dto);
  }
  @Get(':id') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.position(req.membership.companyId, id);
  }
  @Patch(':id') update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.service.updatePosition(req.membership.companyId, id, dto);
  }
  @Post(':id/deactivate') deactivate(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivate(req.membership.companyId, id, 'position');
  }
}
@Module({
  controllers: [CompanyController, DepartmentController, PositionController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
