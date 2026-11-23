import { Module } from '@nestjs/common';
import { OvertimeAllocationController } from './overtime-allocation.controller';
import { OvertimeAllocationService } from './overtime-allocation.service';

@Module({
  controllers: [OvertimeAllocationController],
  providers: [OvertimeAllocationService],
})
export class OvertimeAllocationModule {}
