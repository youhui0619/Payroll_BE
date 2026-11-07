import {
  BadRequestException,
  INestApplication,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { ErrorFilter } from '../error.filter';
export function validationDetails(
  errors: ValidationError[],
  prefix = '',
): { field: string; code: string; message: string }[] {
  return errors.flatMap((e) => {
    const field = prefix ? prefix + '.' + e.property : e.property;
    return [
      ...Object.entries(e.constraints ?? {}).map(([code, message]) => ({
        field,
        code,
        message,
      })),
      ...validationDetails(e.children ?? [], field),
    ];
  });
}
export function configureHttp(app: INestApplication) {
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = Date.now();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () =>
      Logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
        'HTTP',
      ),
    );
    next();
  });
  app.useGlobalFilters(new ErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Check the supplied fields.',
          errors: validationDetails(errors),
        }),
    }),
  );
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  if (origins.length)
    app.enableCors({ origin: origins, exposedHeaders: ['X-Request-Id'] });
}
