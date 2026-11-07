import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/auth.module';
import { Database } from './database.module';
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private db: Database) {}
  @Get('live') live() {
    return { data: { status: 'ok' } };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { data: { status: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('Database not ready.');
    }
  }
}
