import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP_ERROR');

  private log(
    error: unknown,
    req: Request,
    requestId: string,
    status: number,
    code: string,
    message: string,
    errors?: unknown,
  ) {
    const details = {
      requestId,
      method: req?.method,
      path: req?.originalUrl ?? req?.url,
      status,
      code,
      message,
      ...(errors ? { errors } : {}),
      errorName: error instanceof Error ? error.name : typeof error,
    };
    const serialized = JSON.stringify(details);
    if (status >= 500) {
      this.logger.error(
        serialized,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }
    this.logger.warn(serialized);
  }

  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = res.locals.requestId ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034') {
        this.log(
          error,
          req,
          requestId,
          409,
          'CONCURRENT_MODIFICATION',
          'Data changed concurrently. Reload and retry.',
        );
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
        this.log(
          error,
          req,
          requestId,
          mapped[0] as number,
          mapped[1] as string,
          mapped[2] as string,
        );
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
    const code =
      status >= 500
        ? 'INTERNAL_ERROR'
        : typeof source === 'object' && source && 'code' in source
          ? (source.code as string)
          : (codes[status] ?? 'REQUEST_FAILED');
    const responseMessage =
      status >= 500
        ? 'An unexpected error occurred.'
        : Array.isArray(message)
          ? 'Check the supplied fields.'
          : (message ?? 'Request failed.');
    const errors =
      status < 500 && typeof source === 'object' && source && 'errors' in source
        ? source.errors
        : status < 500 && Array.isArray(message)
          ? message.map((value) => ({
              code: 'INVALID_VALUE',
              message: value,
            }))
          : undefined;
    this.log(error, req, requestId, status, code, responseMessage, errors);
    res.status(status).json({
      code,
      message: responseMessage,
      requestId,
      ...(errors ? { errors } : {}),
    });
  }
}
