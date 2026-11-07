import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/common/http-setup';
import { openApi } from '../src/common/openapi';
async function main() {
  process.env.JWT_SECRET = 'openapi-generation-only-not-for-serving-requests';
  process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused';
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureHttp(app);
    await writeFile('openapi.json', JSON.stringify(openApi(app), null, 2));
    console.log('Generated openapi.json');
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error('OpenAPI generation failed');
  process.exitCode = 1;
});
