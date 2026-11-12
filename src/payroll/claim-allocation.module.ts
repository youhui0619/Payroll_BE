import { Module } from '@nestjs/common';
import { ClaimAllocationController } from './claim-allocation.controller';
import { ClaimAllocationService } from './claim-allocation.service';

@Module({
  controllers: [ClaimAllocationController],
  providers: [ClaimAllocationService],
})
export class ClaimAllocationModule {}
