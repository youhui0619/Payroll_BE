import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
type Window = { count: number; expires: number };
@Injectable()
export class LoginLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ ip: string }>();
    const now = Date.now(),
      key = req.ip ?? 'unknown';
    for (const [ip, w] of this.windows)
      if (w.expires <= now) this.windows.delete(ip);
    const prior = this.windows.get(key);
    if (prior && prior.count >= 20)
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Try again in 15 minutes.',
        },
        429,
      );
    if (!prior && this.windows.size >= 10000)
      throw new HttpException('Login capacity reached. Try later.', 429);
    this.windows.set(key, {
      count: (prior?.count ?? 0) + 1,
      expires: prior?.expires ?? now + 15 * 60000,
    });
    return true;
  }
}
