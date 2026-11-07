import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
export class DepartmentDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 30)
  code: string;
  @ApiProperty() @IsString() @Length(1, 120) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}
export class PositionDto {
  @ApiProperty() @IsUUID() departmentId: string;
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 30)
  code: string;
  @ApiProperty() @IsString() @Length(1, 120) title: string;
}
export class CompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  registrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNo?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  financialYearStartMonth?: number;
}
export class UpdatePositionDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 120)
  title?: string;
}
