import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
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
  ApiPropertyOptional,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { Membership, Prisma } from '@prisma/client';
import { PageDto, paginated } from '../common/page.dto';
import { Database } from '../database.module';
import { TenantRequest } from '../auth/auth.module';
import {
  audit,
  fail,
  mayRead,
  privileged,
  selfEmployee,
} from '../common/domain';
import { Storage } from './storage';
import { Scanner } from './scanner';
export type Upload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
export function sniff(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  return null;
}
export class UploadDto {
  @ApiPropertyOptional({
    enum: ['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'],
  })
  @IsIn(['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'])
  category = 'EMPLOYEE_DOCUMENT';
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() claimId?: string;
}
export class FileQueryDto extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() claimId?: string;
  @ApiPropertyOptional({
    enum: ['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'],
  })
  @IsOptional()
  @IsIn(['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'])
  category?: string;
}
@Injectable()
export class FilesService {
  constructor(
    private db: Database,
    private storage: Storage,
    private scanner: Scanner,
  ) {}
  async list(m: Membership, q: FileQueryDto) {
    if (!m.employeeId && !privileged(m, ['OWNER', 'HR', 'FINANCE']))
      return paginated([], 0, q);
    const access: Prisma.StoredFileWhereInput = privileged(m, ['OWNER', 'HR'])
      ? {}
      : {
          OR: [
            ...(m.employeeId ? [{ employeeId: m.employeeId }] : []),
            ...(privileged(m, ['FINANCE']) || m.employeeId
              ? [
                  {
                    category: 'CLAIM_RECEIPT',
                    claim: privileged(m, ['FINANCE'])
                      ? { is: { companyId: m.companyId } }
                      : {
                          is: {
                            companyId: m.companyId,
                            managerId: m.employeeId,
                          },
                        },
                  },
                ]
              : []),
          ],
        };
    const where: Prisma.StoredFileWhereInput = {
      companyId: m.companyId,
      archived: false,
      employeeId: q.employeeId,
      claimId: q.claimId,
      category: q.category,
      ...(q.search
        ? { originalName: { contains: q.search, mode: 'insensitive' } }
        : {}),
      AND: [access],
    };
    const [data, total] = await this.db.$transaction([
      this.db.storedFile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.storedFile.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async archive(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.storedFile.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        mayRead(m, row.employeeId);
        if (row.claimId) {
          const claim = await tx.claim.findUnique({
            where: {
              companyId_id: { companyId: m.companyId, id: row.claimId },
            },
          });
          if (!claim || claim.status !== 'DRAFT')
            fail(
              'ATTACHMENT_LOCKED',
              'Submitted claim receipts must be retained.',
              409,
            );
        }
        if (row.archived) return { data: row };
        const data = await tx.storedFile.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { archived: true },
        });
        await audit(tx, m, 'FILE_ARCHIVED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async upload(m: Membership, d: UploadDto, file: Upload) {
    if (!file?.buffer?.length || file.size > 5 * 1024 * 1024)
      fail('INVALID_FILE', 'Upload a non-empty file up to 5 MiB.', 400);
    const mime = sniff(file.buffer);
    if (!mime || mime !== file.mimetype)
      fail(
        'UNSUPPORTED_FILE',
        'Only matching PDF, PNG and JPEG files are accepted.',
        400,
      );
    const employeeId = d.employeeId ?? (await selfEmployee(this.db, m)).id;
    mayRead(m, employeeId);
    if (
      !(await this.db.employee.findFirst({
        where: { id: employeeId, companyId: m.companyId, active: true },
      }))
    )
      throw new NotFoundException();
    if (d.claimId && d.category !== 'CLAIM_RECEIPT')
      fail('INVALID_ATTACHMENT', 'Claim links require CLAIM_RECEIPT.', 400);
    if (d.category === 'CLAIM_RECEIPT' && !d.claimId)
      fail('INVALID_ATTACHMENT', 'Receipt requires a claim ID.', 400);
    const scanStatus = await this.scanner.scan(file.buffer);
    const id = randomUUID();
    await this.storage.put(id, file.buffer, mime);
    try {
      return await this.db.$transaction(
        async (tx) => {
          if (d.claimId) {
            const claim = await tx.claim.findFirst({
              where: {
                id: d.claimId,
                companyId: m.companyId,
                employeeId,
                status: 'DRAFT',
              },
            });
            if (!claim)
              throw new NotFoundException('Editable claim not found.');
          }
          const data = await tx.storedFile.create({
            data: {
              id,
              companyId: m.companyId,
              employeeId,
              uploadedBy: m.userId,
              originalName: file.originalname
                .replace(/[\r\n\x00-\x1f]/g, '')
                .slice(0, 200),
              mimeType: mime,
              size: file.size,
              sha256: createHash('sha256').update(file.buffer).digest('hex'),
              category: d.category,
              claimId: d.claimId,
              scanStatus,
            },
          });
          await audit(tx, m, 'FILE_UPLOADED', id);
          return { data };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      await this.storage.remove(id).catch(() => undefined);
      throw error;
    }
  }
  async authorized(m: Membership, id: string) {
    const row = await this.db.storedFile.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!row || row.archived) throw new NotFoundException();
    let access =
      m.employeeId === row.employeeId || privileged(m, ['OWNER', 'HR']);
    if (!access && row.category === 'CLAIM_RECEIPT' && row.claimId) {
      const claim = await this.db.claim.findUnique({
        where: { companyId_id: { companyId: m.companyId, id: row.claimId } },
      });
      access =
        !!claim &&
        (privileged(m, ['FINANCE']) ||
          (!!m.employeeId && claim.managerId === m.employeeId));
    }
    if (!access) throw new NotFoundException();
    return row;
  }
  async download(m: Membership, id: string) {
    const row = await this.authorized(m, id);
    if (
      row.scanStatus !== 'CLEAN' &&
      !(
        row.scanStatus === 'UNSCANNED' &&
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_UNSCANNED_UPLOADS === 'true'
      )
    )
      fail('FILE_QUARANTINED', 'File is awaiting scanning.', 409);
    const bytes = await this.storage.get(row.id);
    await audit(this.db, m, 'FILE_DOWNLOADED', id);
    return { row, bytes };
  }
}
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
@Module({
  controllers: [FilesController],
  providers: [FilesService, Storage, Scanner],
})
export class FilesModule {}
