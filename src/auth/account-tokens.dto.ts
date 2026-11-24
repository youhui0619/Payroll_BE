import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { emptyStringAsUndefined } from '../common/transformers';

export class InviteEmployeeAccountDto {
  @ApiPropertyOptional({
    description: 'Override the employee email used for the invitation.',
    example: 'employee@example.com',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description: 'Token lifetime in hours. Defaults to 72 hours.',
    minimum: 1,
    maximum: 168,
    default: 72,
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class ActivateAccountDto {
  @ApiProperty({ writeOnly: true, minLength: 20, maxLength: 256 })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token: string;

  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class ResetPasswordDto {
  @ApiProperty({ writeOnly: true, minLength: 20, maxLength: 256 })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token: string;

  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class IssuePasswordResetDto {
  @ApiPropertyOptional({
    description: 'Token lifetime in hours. Defaults to one hour.',
    minimum: 1,
    maximum: 24,
    default: 1,
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsInt()
  @Min(1)
  @Max(24)
  expiresInHours?: number;
}
