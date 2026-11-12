import { Module } from '@nestjs/common';
import { Storage } from './storage';
import { Scanner } from './scanner';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, Storage, Scanner],
})
export class FilesModule {}
