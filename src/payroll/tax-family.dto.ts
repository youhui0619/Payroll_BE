import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChildReliefKind, FamilyReliefInput } from './family-reliefs';

export class ChildReliefDto {
  @ApiProperty({
    description:
      'Stable internal reference, not a national identification number.',
  })
  @IsString()
  @Length(1, 100)
  reference: string;
  @ApiProperty({
    enum: [
      'STANDARD',
      'HIGHER_EDUCATION',
      'DISABLED',
      'DISABLED_HIGHER_EDUCATION',
    ],
  })
  @IsIn([
    'STANDARD',
    'HIGHER_EDUCATION',
    'DISABLED',
    'DISABLED_HIGHER_EDUCATION',
  ])
  kind: ChildReliefKind;
  @ApiProperty({ enum: ['FULL', 'HALF'] }) @IsIn(['FULL', 'HALF']) share:
    'FULL' | 'HALF';
}
export class TaxFamilyDto implements FamilyReliefInput {
  @ApiProperty({ enum: [2026] }) @IsIn([2026]) year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({ enum: ['RESIDENT', 'NON_RESIDENT'] })
  @IsIn(['RESIDENT', 'NON_RESIDENT'])
  residency: 'RESIDENT' | 'NON_RESIDENT';
  @ApiProperty({ enum: [1, 2, 3] }) @IsIn([1, 2, 3]) category: 1 | 2 | 3;
  @ApiProperty() @IsBoolean() disabledIndividual: boolean;
  @ApiProperty() @IsBoolean() spouseReliefEligible: boolean;
  @ApiProperty() @IsBoolean() disabledSpouseReliefEligible: boolean;
  @ApiProperty({ type: [ChildReliefDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChildReliefDto)
  children: ChildReliefDto[];
  @ApiProperty() @IsString() @Length(1, 500) evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class TaxFamilyVersionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() year: number;
  @ApiProperty() effectiveMonth: number;
  @ApiProperty() revision: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  declaration: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Calculated family-only relief breakdown, source reference and limitations; excludes TP1 and EPF.',
  })
  reliefs: Record<string, unknown>;
  @ApiProperty() evidenceReference: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class TaxFamilyResponseDto {
  @ApiProperty({ type: TaxFamilyVersionDto }) data: TaxFamilyVersionDto;
}
export class TaxFamilyHistoryDto {
  @ApiProperty({ type: [TaxFamilyVersionDto] }) data: TaxFamilyVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
