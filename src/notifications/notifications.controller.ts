import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantRequest } from '../auth/auth.decorators';
import { NotificationsService } from './notifications.service';
import {
  NotificationListResponseDto,
  NotificationQueryDto,
  NotificationReadResponseDto,
} from './notifications.dto';

@ApiBearerAuth()
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationListResponseDto })
  @ApiOperation({ summary: 'List the signed-in user’s in-app notifications' })
  list(@Req() r: TenantRequest, @Query() q: NotificationQueryDto) {
    return this.service.list(r.membership, q);
  }

  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationReadResponseDto })
  @ApiOperation({ summary: 'Mark one notification as read' })
  read(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(r.membership, id);
  }

  @Post('read-all')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiOperation({ summary: 'Mark all signed-in user notifications as read' })
  readAll(@Req() r: TenantRequest) {
    return this.service.readAll(r.membership);
  }
}
