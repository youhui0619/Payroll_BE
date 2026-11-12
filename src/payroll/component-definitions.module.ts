import { Module } from '@nestjs/common';
import { ComponentDefinitionsController } from './component-definitions.controller';
import { ComponentDefinitionsService } from './component-definitions.service';

@Module({
  controllers: [ComponentDefinitionsController],
  providers: [ComponentDefinitionsService],
  exports: [ComponentDefinitionsService],
})
export class ComponentDefinitionsModule {}
