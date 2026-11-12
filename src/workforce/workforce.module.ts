import { Module } from '@nestjs/common';
import { WorkforceService } from './workforce.service';
import { WorkforceController } from './workforce.controller';

@Module({ controllers: [WorkforceController], providers: [WorkforceService] })
export class WorkforceModule {}
