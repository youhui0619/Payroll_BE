import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Membership, Prisma } from '@prisma/client';
import { paginated } from '../common/page.dto';
import {
  FILE_SCAN_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import { Database } from '../database.module';
import {
  audit,
  fail,
  mayRead,
  privileged,
  selfEmployee,
} from '../common/domain';
import { Storage } from './storage';
import { Scanner } from './scanner';
import { Upload, UploadDto, FileQueryDto } from './files.dto';
import { sniff } from './files.utils';

@Injectable()
export class FilesService {
  constructor(
    private db: Database,
    private storage: Storage,
    private scanner: Scanner,
  ) {}
  async list(m: Membership, q: FileQueryDto) {
    if (!m.employeeId && !privileged(m, ['OWNER', 'HR', 'FINANCE']))
      return paginated([], 0, q, {
        summary: { statusCounts: makeStatusCounts(FILE_SCAN_STATUS_VALUES) },
      });
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
      leaveRequestId: q.leaveRequestId,
      overtimeRequestId: q.overtimeRequestId,
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
    const statusCountValues = await Promise.all(
      FILE_SCAN_STATUS_VALUES.map((status) =>
        this.db.storedFile.count({ where: { ...where, scanStatus: status } }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(
          FILE_SCAN_STATUS_VALUES,
          statusCountValues,
        ),
      },
    });
  }
  async archive(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.storedFile.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.category === 'COMPANY_LOGO') {
          if (!privileged(m, ['OWNER', 'HR'])) throw new ForbiddenException();
        } else {
          if (!row.employeeId) throw new NotFoundException();
          mayRead(m, row.employeeId);
        }
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
        if (row.leaveRequestId) {
          const leave = await tx.leaveRequest.findUnique({
            where: {
              companyId_id: {
                companyId: m.companyId,
                id: row.leaveRequestId,
              },
            },
          });
          if (!leave || leave.status !== 'DRAFT')
            fail(
              'ATTACHMENT_LOCKED',
              'Submitted leave documents must be retained.',
              409,
            );
        }
        if (row.overtimeRequestId) {
          const overtime = await tx.overtimeRequest.findUnique({
            where: {
              companyId_id: {
                companyId: m.companyId,
                id: row.overtimeRequestId,
              },
            },
          });
          if (!overtime || overtime.status !== 'DRAFT')
            fail(
              'ATTACHMENT_LOCKED',
              'Submitted overtime documents must be retained.',
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
    const companyLogo = d.category === 'COMPANY_LOGO';
    const employeeId = companyLogo
      ? null
      : (d.employeeId ?? (await selfEmployee(this.db, m)).id);
    if (companyLogo) {
      if (!privileged(m, ['OWNER', 'HR'])) throw new ForbiddenException();
      if (d.employeeId || d.claimId || d.leaveRequestId || d.overtimeRequestId)
        fail(
          'INVALID_ATTACHMENT',
          'Company logos cannot link to employees or requests.',
          400,
        );
    } else {
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
      if (d.leaveRequestId && d.category !== 'LEAVE_DOCUMENT')
        fail('INVALID_ATTACHMENT', 'Leave links require LEAVE_DOCUMENT.', 400);
      if (d.category === 'LEAVE_DOCUMENT' && !d.leaveRequestId)
        fail(
          'INVALID_ATTACHMENT',
          'Leave documents require a leave request ID.',
          400,
        );
      if (d.overtimeRequestId && d.category !== 'OVERTIME_DOCUMENT')
        fail(
          'INVALID_ATTACHMENT',
          'Overtime links require OVERTIME_DOCUMENT.',
          400,
        );
      if (d.category === 'OVERTIME_DOCUMENT' && !d.overtimeRequestId)
        fail(
          'INVALID_ATTACHMENT',
          'Overtime documents require an overtime request ID.',
          400,
        );
      if (
        [d.claimId, d.leaveRequestId, d.overtimeRequestId].filter(Boolean)
          .length > 1
      )
        fail('INVALID_ATTACHMENT', 'A file can link to only one request.', 400);
    }
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
                employeeId: employeeId as string,
                status: 'DRAFT',
              },
            });
            if (!claim)
              throw new NotFoundException('Editable claim not found.');
          }
          if (d.leaveRequestId) {
            const leave = await tx.leaveRequest.findFirst({
              where: {
                id: d.leaveRequestId,
                companyId: m.companyId,
                employeeId: employeeId as string,
                status: 'DRAFT',
              },
            });
            if (!leave)
              throw new NotFoundException('Editable leave request not found.');
          }
          if (d.overtimeRequestId) {
            const overtime = await tx.overtimeRequest.findFirst({
              where: {
                id: d.overtimeRequestId,
                companyId: m.companyId,
                employeeId: employeeId as string,
                status: 'DRAFT',
              },
            });
            if (!overtime)
              throw new NotFoundException(
                'Editable overtime request not found.',
              );
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
              leaveRequestId: d.leaveRequestId,
              overtimeRequestId: d.overtimeRequestId,
              scanStatus,
            },
          });
          if (companyLogo) {
            await tx.storedFile.updateMany({
              where: {
                companyId: m.companyId,
                category: 'COMPANY_LOGO',
                archived: false,
                id: { not: id },
              },
              data: { archived: true },
            });
            await tx.company.update({
              where: { id: m.companyId },
              data: { logo: this.publicUrl(id) },
            });
            await audit(tx, m, 'COMPANY_LOGO_UPDATED', id);
          }
          await audit(tx, m, 'FILE_UPLOADED', id);
          return {
            data: {
              ...data,
              ...(companyLogo ? { url: this.publicUrl(id) } : {}),
            },
          };
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
    if (
      !access &&
      row.category === 'OVERTIME_DOCUMENT' &&
      row.overtimeRequestId
    ) {
      const overtime = await this.db.overtimeRequest.findUnique({
        where: {
          companyId_id: {
            companyId: m.companyId,
            id: row.overtimeRequestId,
          },
        },
        include: { employee: { select: { managerId: true } } },
      });
      access =
        !!overtime &&
        !!m.employeeId &&
        overtime.employee.managerId === m.employeeId;
    }
    if (!access) throw new NotFoundException();
    return row;
  }
  async download(m: Membership, id: string) {
    const row = await this.authorized(m, id);
    this.assertDownloadable(row.scanStatus);
    const bytes = await this.storage.get(row.id);
    await audit(this.db, m, 'FILE_DOWNLOADED', id);
    return { row, bytes };
  }
  async publicLogo(id: string) {
    const row = await this.db.storedFile.findUnique({ where: { id } });
    if (!row || row.archived || row.category !== 'COMPANY_LOGO')
      throw new NotFoundException();
    this.assertDownloadable(row.scanStatus);
    const bytes = await this.storage.get(row.id);
    return { row, bytes };
  }
  private assertDownloadable(scanStatus: string) {
    if (
      scanStatus !== 'CLEAN' &&
      !(
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_UNSCANNED_UPLOADS === 'true' &&
        scanStatus === 'UNSCANNED'
      )
    )
      fail('FILE_QUARANTINED', 'File is awaiting scanning.', 409);
  }
  private publicUrl(id: string) {
    const base = (
      process.env.PUBLIC_API_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/+$/, '');
    return `${base}/api/v1/files/public/${id}`;
  }
}
