import {
  HttpException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
export function fail(code: string, message: string, status = 422): never {
  throw new HttpException({ code, message }, status);
}
export const dateOnly = (value: string) => new Date(value + 'T00:00:00.000Z');
export const dateString = (value: Date) => value.toISOString().slice(0, 10);
export function localDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export const privileged = (m: Membership, roles: string[]) =>
  m.roles.some((role) => roles.includes(role));
export async function selfEmployee(
  tx: Prisma.TransactionClient,
  m: Membership,
) {
  if (!m.employeeId) throw new NotFoundException('No employee linked.');
  const employee = await tx.employee.findFirst({
    where: { companyId: m.companyId, id: m.employeeId, active: true },
  });
  if (!employee) throw new NotFoundException('Active employee not found.');
  return employee;
}
export function mayRead(
  m: Membership,
  employeeId: string,
  roles = ['OWNER', 'HR'],
) {
  if (m.employeeId !== employeeId && !privileged(m, roles))
    throw new ForbiddenException();
}
export async function audit(
  tx: Prisma.TransactionClient,
  m: Membership,
  action: string,
  resourceId: string,
) {
  await tx.auditEvent.create({
    data: { companyId: m.companyId, actorId: m.userId, action, resourceId },
  });
}
export class DecisionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  comment?: string;
}
export function decisionComment(dto: DecisionDto) {
  if (dto.decision === 'REJECT' && !dto.comment?.trim())
    fail('COMMENT_REQUIRED', 'Rejection requires a comment.', 400);
}
