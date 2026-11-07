import { FilesService, sniff } from './files.module';
import { Membership } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
describe('private file boundary', () => {
  it('returns no metadata for an unlinked employee without querying files', async () => {
    const db = { storedFile: { findMany: jest.fn() } };
    const result = await new FilesService(
      db as never,
      {} as never,
      {} as never,
    ).list(
      {
        companyId: 'company',
        roles: ['EMPLOYEE'],
        employeeId: null,
      } as Membership,
      { page: 1, pageSize: 20 },
    );
    expect(result.data).toEqual([]);
    expect(db.storedFile.findMany).not.toHaveBeenCalled();
  });
  it('never downloads a rejected file even with the development bypass', async () => {
    const previous = process.env.ALLOW_UNSCANNED_UPLOADS;
    try {
      process.env.ALLOW_UNSCANNED_UPLOADS = 'true';
      const storage = { get: jest.fn() };
      const service = new FilesService(
        {} as never,
        storage as never,
        {} as never,
      );
      jest
        .spyOn(service, 'authorized')
        .mockResolvedValue({ id: 'file', scanStatus: 'INFECTED' } as never);
      await expect(
        service.download({} as Membership, 'file'),
      ).rejects.toMatchObject({ response: { code: 'FILE_QUARANTINED' } });
      expect(storage.get).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.ALLOW_UNSCANNED_UPLOADS;
      else process.env.ALLOW_UNSCANNED_UPLOADS = previous;
    }
  });
  it('sniffs only accepted signatures', () => {
    expect(sniff(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniff(Buffer.from('<script>'))).toBeNull();
  });
  it('does not expose other employee documents to finance', async () => {
    const db = {
      storedFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file',
          employeeId: 'other',
          category: 'EMPLOYEE_DOCUMENT',
          archived: false,
        }),
      },
    };
    const m = {
      companyId: 'company',
      employeeId: 'self',
      roles: ['FINANCE'],
    } as Membership;
    await expect(
      new FilesService(db as never, {} as never, {} as never).authorized(
        m,
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.storedFile.findUnique).toHaveBeenCalledWith({
      where: { companyId_id: { companyId: 'company', id: 'file' } },
    });
  });
  it('allows finance to read linked claim receipts only', async () => {
    const db = {
      storedFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file',
          employeeId: 'other',
          category: 'CLAIM_RECEIPT',
          claimId: 'claim',
        }),
      },
      claim: { findUnique: jest.fn().mockResolvedValue({ id: 'claim' }) },
    };
    await expect(
      new FilesService(db as never, {} as never, {} as never).authorized(
        { companyId: 'company', roles: ['FINANCE'] } as Membership,
        'file',
      ),
    ).resolves.toMatchObject({ id: 'file' });
  });
});
