import { Module } from '@nestjs/common';
import { TaxFamilyController } from './tax-family.controller';
import { TaxFamilyService } from './tax-family.service';

@Module({ controllers: [TaxFamilyController], providers: [TaxFamilyService] })
export class TaxFamilyModule {}
