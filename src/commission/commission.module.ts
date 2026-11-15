import { Module } from '@nestjs/common';
import { CommissionController } from './commission.controller';
import { CommissionService } from './commission.service';

@Module({ controllers: [CommissionController], providers: [CommissionService] })
export class CommissionModule {}
