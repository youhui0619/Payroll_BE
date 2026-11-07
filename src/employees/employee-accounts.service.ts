import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { hashPassword } from '../auth/password';

export class CreateEmployeeAccountDto {
  @ApiProperty({ example: 'employee@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
@Injectable()
export class EmployeeAccountsService {
  constructor(private db: Database) {}
  async create(
    companyId: string,
    employeeId: string,
    dto: CreateEmployeeAccountDto,
  ) {
    // Hash outside the transaction so password derivation does not hold database locks.
    const passwordHash = await hashPassword(dto.password);
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findFirst({
          where: { companyId, id: employeeId, active: true },
        });
        if (!employee)
          throw new NotFoundException('Active employee not found.');
        const linked = await tx.membership.findUnique({
          where: { companyId_employeeId: { companyId, employeeId } },
        });
        if (linked)
          throw new ConflictException('Employee already has a linked account.');
        const email = dto.email.trim().toLowerCase();
        if (await tx.user.findUnique({ where: { email } }))
          throw new ConflictException(
            'Email is unavailable for a new account.',
          );
        const user = await tx.user.create({ data: { email, passwordHash } });
        const membership = await tx.membership.create({
          data: { companyId, employeeId, userId: user.id, roles: ['EMPLOYEE'] },
        });
        return {
          data: {
            userId: user.id,
            membershipId: membership.id,
            employeeId,
            email,
            roles: membership.roles,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async me(companyId: string, membershipId: string) {
    // Resolve the link from the authenticated membership, never by request email/employee ID.
    const membership = await this.db.membership.findFirst({
      where: { id: membershipId, companyId, active: true },
    });
    if (!membership?.employeeId)
      throw new NotFoundException('No employee is linked to this account.');
    const data = await this.db.employee.findFirst({
      where: { id: membership.employeeId, companyId, active: true },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        email: true,
        joinedDate: true,
        departmentId: true,
        positionId: true,
      },
    });
    if (!data) throw new NotFoundException('Active employee not found.');
    return { data };
  }
}
