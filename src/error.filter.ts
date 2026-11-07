import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034') {
        const requestId = res.locals.requestId ?? randomUUID();
        res.setHeader('X-Request-Id', requestId);
        res.status(409).json({
          code: 'CONCURRENT_MODIFICATION',
          message: 'Data changed concurrently. Reload and retry.',
          requestId,
        });
        return;
      }
      const mapped = {
        P2002: [
          409,
          'DUPLICATE_RECORD',
          'A record with this code already exists.',
        ],
        P2025: [404, 'NOT_FOUND', 'Record not found.'],
        P2003: [
          409,
          'RELATED_RECORD_CONFLICT',
          'The related record is missing or still in use.',
        ],
      }[error.code];
      if (mapped) {
        const requestId = res.locals.requestId ?? randomUUID();
        res.setHeader('X-Request-Id', requestId);
        res
          .status(mapped[0] as number)
          .json({ code: mapped[1], message: mapped[2], requestId });
        return;
      }
    }
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const source = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof source === 'string'
        ? source
        : (source as { message?: string | string[] })?.message;
    const codes: Record<number, string> = {
      400: 'VALIDATION_FAILED',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'BUSINESS_RULE_FAILED',
      429: 'RATE_LIMITED',
    };
    const requestId = res.locals.requestId ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.status(status).json({
      code:
        status >= 500
          ? 'INTERNAL_ERROR'
          : typeof source === 'object' && source && 'code' in source
            ? source.code
            : (codes[status] ?? 'REQUEST_FAILED'),
      message:
        status >= 500
          ? 'An unexpected error occurred.'
          : Array.isArray(message)
            ? 'Check the supplied fields.'
            : (message ?? 'Request failed.'),
      requestId,
      ...(status < 500 &&
      typeof source === 'object' &&
      source &&
      'errors' in source
        ? { errors: source.errors }
        : status < 500 && Array.isArray(message)
          ? {
              errors: message.map((value) => ({
                code: 'INVALID_VALUE',
                message: value,
              })),
            }
          : {}),
    });
  }
}
