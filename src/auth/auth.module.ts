import { Module } from '@nestjs/common';
import { LoginLimitGuard } from './login-limit.guard';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AccountTokensService } from './account-tokens.service';

export { Public, Roles } from './auth.decorators';
export type { TenantRequest } from './auth.decorators';
export { AuthGuard } from './auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        const ttl = Number(process.env.JWT_TTL_SECONDS ?? 3600);
        if (!secret || secret.length < 32 || secret.startsWith('replace-'))
          throw new Error('Set JWT_SECRET to at least 32 random characters.');
        if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400)
          throw new Error('Invalid JWT_TTL_SECONDS');
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: ttl,
            issuer: 'payroll-api',
            audience: 'payroll-web',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AccountTokensService,
    LoginLimitGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [JwtModule, AccountTokensService],
})
export class AuthModule {}
