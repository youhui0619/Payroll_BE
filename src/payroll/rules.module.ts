import { Module } from '@nestjs/common';
import { PcbController } from './pcb.controller';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  controllers: [RulesController, PcbController],
  providers: [RulesService],
})
export class RulesModule {}
