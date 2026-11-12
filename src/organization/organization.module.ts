import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import {
  CompanyController,
  DepartmentController,
  PositionController,
} from './organization.controller';

@Module({
  controllers: [CompanyController, DepartmentController, PositionController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
