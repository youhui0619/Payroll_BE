import { ArgumentsHost, Logger, UnauthorizedException } from '@nestjs/common';
import { ErrorFilter } from './error.filter';

function httpHost() {
  const response: any = {
    locals: { requestId: 'request-id' },
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request: any = {
    method: 'POST',
    originalUrl: '/api/v1/auth/login',
    url: '/api/v1/auth/login',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ErrorFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs safe details for expected HTTP errors', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { host, response } = httpHost();

    new ErrorFilter().catch(
      new UnauthorizedException('Invalid credentials.'),
      host,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"request-id"'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"code":"UNAUTHORIZED"'),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        requestId: 'request-id',
      }),
    );
  });

  it('logs the stack for unexpected server errors', () => {
    const error = new Error('database unavailable');
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host, response } = httpHost();

    new ErrorFilter().catch(error, host);

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('"status":500'),
      error.stack,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        requestId: 'request-id',
      }),
    );
  });
});
