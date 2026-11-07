import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
