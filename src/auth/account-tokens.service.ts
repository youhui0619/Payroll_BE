import { Injectable } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import {
  ActivateAccountDto,
  InviteEmployeeAccountDto,
  ResetPasswordDto,
} from './account-tokens.dto';
import { hashPassword } from './password';

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const tokenHash = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const newToken = () => randomBytes(32).toString('base64url');

const expiry = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

@Injectable()
export class AccountTokensService {
  constructor(private db: Database) {}

  async invite(
    m: Membership,
    employeeId: string,
    dto: InviteEmployeeAccountDto,
  ) {
    const rawToken = newToken();
    const expiresAt = expiry(dto.expiresInHours ?? 72);
    const hash = tokenHash(rawToken);
    return this.db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { companyId: m.companyId, id: employeeId, active: true },
        select: { id: true, name: true, email: true },
      });
      if (!employee)
        fail('EMPLOYEE_NOT_FOUND', 'Active employee not found.', 404);
      const email = (dto.email ?? employee.email)?.trim().toLowerCase();
      if (!email)
        fail(
          'INVITATION_EMAIL_REQUIRED',
          'An employee email is required before an account can be invited.',
          422,
        );
      const linked = await tx.membership.findUnique({
        where: { companyId_employeeId: { companyId: m.companyId, employeeId } },
        select: { id: true },
      });
      if (linked)
        fail(
          'ACCOUNT_ALREADY_LINKED',
          'This employee already has an account.',
          409,
        );
      if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
        fail(
          'ACCOUNT_EXISTS',
          'This email is already registered. Use membership administration instead.',
          409,
        );
      await tx.accountToken.updateMany({
        where: {
          companyId: m.companyId,
          employeeId,
          kind: 'INVITE',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const token = await tx.accountToken.create({
        data: {
          companyId: m.companyId,
          employeeId,
          email,
          kind: 'INVITE',
          tokenHash: hash,
          expiresAt,
        },
      });
      await audit(tx, m, 'ACCOUNT_INVITATION_CREATED', token.id, {
        employeeId,
        email,
        expiresAt: expiresAt.toISOString(),
      });
      return {
        data: {
          token: rawToken,
          tokenType: 'ACCOUNT_INVITATION',
          expiresAt,
          employeeId,
          email,
          employeeName: employee.name,
        },
      };
    }, serializable);
  }

  async activate(dto: ActivateAccountDto) {
    const passwordHash = await hashPassword(dto.password);
    const hash = tokenHash(dto.token);
    return this.db.$transaction(async (tx) => {
      const token = await tx.accountToken.findFirst({
        where: {
          tokenHash: hash,
          kind: 'INVITE',
          consumedAt: null,
          revokedAt: null,
        },
      });
      if (!token || token.expiresAt <= new Date())
        fail(
          'INVALID_ACCOUNT_INVITATION',
          'This account invitation is invalid or expired.',
          422,
        );
      if (!token.employeeId || !token.email)
        fail(
          'INVALID_ACCOUNT_INVITATION',
          'This account invitation is invalid or expired.',
          422,
        );
      const employee = await tx.employee.findFirst({
        where: {
          companyId: token.companyId,
          id: token.employeeId,
          active: true,
        },
        select: { id: true, name: true },
      });
      if (!employee)
        fail(
          'EMPLOYEE_NOT_AVAILABLE',
          'The invited employee is no longer active.',
          422,
        );
      const linked = await tx.membership.findUnique({
        where: {
          companyId_employeeId: {
            companyId: token.companyId,
            employeeId: token.employeeId,
          },
        },
        select: { id: true },
      });
      if (linked)
        fail(
          'ACCOUNT_ALREADY_LINKED',
          'This employee already has an account.',
          409,
        );
      if (
        await tx.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        })
      )
        fail(
          'ACCOUNT_EXISTS',
          'This email is already registered. Contact an administrator.',
          409,
        );
      const user = await tx.user.create({
        data: { email: token.email, fullName: employee.name, passwordHash },
      });
      const membership = await tx.membership.create({
        data: {
          companyId: token.companyId,
          userId: user.id,
          employeeId: token.employeeId,
          roles: ['EMPLOYEE'],
        },
      });
      await tx.accountToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          companyId: token.companyId,
          actorId: user.id,
          action: 'ACCOUNT_ACTIVATED',
          resourceId: membership.id,
          metadata: { employeeId: token.employeeId },
        },
      });
      return {
        data: {
          userId: user.id,
          membershipId: membership.id,
          employeeId: token.employeeId,
          email: token.email,
          roles: membership.roles,
        },
      };
    }, serializable);
  }

  async issuePasswordReset(
    m: Membership,
    membershipId: string,
    expiresInHours = 1,
  ) {
    const rawToken = newToken();
    const expiresAt = expiry(expiresInHours);
    const hash = tokenHash(rawToken);
    return this.db.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { id: membershipId, companyId: m.companyId, active: true },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          user: { select: { email: true, active: true } },
        },
      });
      if (!membership)
        fail('MEMBERSHIP_NOT_FOUND', 'Active membership not found.', 404);
      if (!membership.user.active)
        fail('ACCOUNT_INACTIVE', 'The target account is inactive.', 422);
      await tx.accountToken.updateMany({
        where: {
          companyId: m.companyId,
          userId: membership.userId,
          kind: 'PASSWORD_RESET',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const token = await tx.accountToken.create({
        data: {
          companyId: m.companyId,
          userId: membership.userId,
          kind: 'PASSWORD_RESET',
          email: membership.user.email,
          tokenHash: hash,
          expiresAt,
        },
      });
      await audit(tx, m, 'PASSWORD_RESET_ISSUED', token.id, {
        membershipId,
        employeeId: membership.employeeId,
        expiresAt: expiresAt.toISOString(),
      });
      return {
        data: {
          token: rawToken,
          tokenType: 'PASSWORD_RESET',
          expiresAt,
          membershipId,
        },
      };
    }, serializable);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await hashPassword(dto.password);
    const hash = tokenHash(dto.token);
    return this.db.$transaction(async (tx) => {
      const token = await tx.accountToken.findFirst({
        where: {
          tokenHash: hash,
          kind: 'PASSWORD_RESET',
          consumedAt: null,
          revokedAt: null,
        },
      });
      if (!token || token.expiresAt <= new Date() || !token.userId)
        fail(
          'INVALID_PASSWORD_RESET',
          'This password-reset token is invalid or expired.',
          422,
        );
      const updated = await tx.user.updateMany({
        where: { id: token.userId, active: true },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      if (!updated.count)
        fail('ACCOUNT_INACTIVE', 'The target account is inactive.', 422);
      await tx.accountToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      });
      await tx.accountToken.updateMany({
        where: {
          companyId: token.companyId,
          userId: token.userId,
          kind: 'PASSWORD_RESET',
          consumedAt: null,
          revokedAt: null,
          id: { not: token.id },
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          companyId: token.companyId,
          actorId: token.userId,
          action: 'PASSWORD_RESET_COMPLETED',
          resourceId: token.userId,
        },
      });
      return { data: { completed: true } };
    }, serializable);
  }
}
