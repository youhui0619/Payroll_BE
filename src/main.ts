import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config';
import { SwaggerModule } from '@nestjs/swagger';
import { configureHttp } from './common/http-setup';
import { openApi } from './common/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  if (process.env.SWAGGER_ENABLED === 'true') {
    const document = openApi(app);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: '/openapi.json',
    });
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
