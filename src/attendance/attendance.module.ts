import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceAdjustmentsService } from './attendance-adjustments.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceAdjustmentsService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
