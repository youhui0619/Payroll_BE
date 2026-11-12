import { Module } from '@nestjs/common';
import { TaxOpeningsController } from './tax-openings.controller';
import { TaxOpeningsService } from './tax-openings.service';

@Module({
  controllers: [TaxOpeningsController],
  providers: [TaxOpeningsService],
})
export class TaxOpeningsModule {}
