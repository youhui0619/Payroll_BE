import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageDto } from '../common/page.dto';

const booleanValue = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class NotificationQueryDto extends PageDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  unreadOnly = false;
}

export class NotificationItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() kind: string;
  @ApiProperty() title: string;
  @ApiProperty() message: string;
  @ApiProperty({ nullable: true, format: 'date-time' }) readAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ nullable: true }) sourceType: string | null;
  @ApiProperty({ nullable: true }) sourceId: string | null;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  payload: Record<string, unknown> | null;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationItemDto] })
  data: NotificationItemDto[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  meta: Record<string, unknown>;
}

export class NotificationReadResponseDto {
  @ApiProperty({ type: NotificationItemDto })
  data: NotificationItemDto;
}
