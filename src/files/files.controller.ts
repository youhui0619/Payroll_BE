import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { Response } from 'express';
import { TenantRequest } from '../auth/auth.decorators';
import { Upload, UploadDto, FileQueryDto } from './files.dto';
import { FilesService } from './files.service';

@ApiBearerAuth()
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private service: FilesService) {}
  @Get()
  @ApiOperation({
    summary:
      'List accessible, unarchived file metadata; filters never widen access.',
  })
  list(@Req() r: TenantRequest, @Query() q: FileQueryDto) {
    return this.service.list(r.membership, q);
  }
  @Post(':id/archive')
  @ApiOperation({
    summary:
      'Archive a document or draft receipt; submitted receipts remain immutable.',
  })
  archive(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(r.membership, id);
  }
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        category: {
          type: 'string',
          enum: ['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'],
        },
        employeeId: { type: 'string', format: 'uuid' },
        claimId: { type: 'string', format: 'uuid' },
        leaveRequestId: { type: 'string', format: 'uuid' },
      },
    },
  })
  upload(
    @Req() r: TenantRequest,
    @Body() d: UploadDto,
    @UploadedFile() f: Upload,
  ) {
    return this.service.upload(r.membership, d, f);
  }
  @Get(':id') async download(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { row, bytes } = await this.service.download(r.membership, id);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }
}
