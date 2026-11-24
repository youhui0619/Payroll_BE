import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '@prisma/client';
import { PageDto } from '../common/page.dto';
import { emptyStringAsUndefined } from '../common/transformers';

export class MembershipQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Filter by active or inactive access.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}

export class CreateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @MaxLength(200)
  fullName?: string;
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles: Role[];
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;
}
export class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @MaxLength(200)
  fullName?: string;
  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles: Role[];
  @ApiProperty() @IsBoolean() active: boolean;
}
