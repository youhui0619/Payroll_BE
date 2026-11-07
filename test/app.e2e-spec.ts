import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Database } from '../src/database.module';
import { configureHttp } from '../src/common/http-setup';
import { openApi } from '../src/common/openapi';
import { JwtService } from '@nestjs/jwt';

describe('application HTTP contract', () => {
  let app: INestApplication;

  const db = { $queryRaw: jest.fn(), membership: { findFirst: jest.fn() } };
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Database)
      .useValue(db)
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  it('serves public liveness without querying PostgreSQL', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ data: { status: 'ok' } });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('reports database readiness and failure', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ value: 1 }]);
    await request(app.getHttpServer()).get('/health/ready').expect(200);
    db.$queryRaw.mockRejectedValueOnce(new Error('private connection details'));
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  it('protects newly registered business routes', async () => {
    for (const path of ['/memberships', '/payroll/runs', '/dashboard']) {
      const response = await request(app.getHttpServer())
        .get('/api/v1' + path)
        .expect(401);
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
      expect(Object.keys(response.body).sort()).toEqual([
        'code',
        'message',
        'requestId',
      ]);
    }
  });
  it('generates a document containing payroll and membership APIs', () => {
    const doc = openApi(app);
    expect(doc.paths['/api/v1/payroll/runs/{id}/preflight'].get).toBeDefined();
    expect(doc.paths['/api/v1/memberships'].post).toBeDefined();
    expect(doc.components.schemas.ApiError).toBeDefined();
    expect(doc.components.schemas.LeaveBalanceResponseDto).toBeDefined();
    expect(doc.components.schemas.CatalogResponseDto).toBeDefined();
    expect(doc.components.schemas.PcbPreviewDto).toBeDefined();
    expect(doc.components.schemas.PayrollProfileHistoryDto).toBeDefined();
    expect(doc.components.schemas.ComponentDefinitionDto).toBeDefined();
    expect(doc.components.schemas.InputPreviewResponseDto).toBeDefined();
    expect(
      doc.paths['/api/v1/payroll/runs/{runId}/claims/{claimId}/allocate'].post,
    ).toBeDefined();
  });
  it('protects component configuration and validates basis flags and salary months', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path = '/api/v1/payroll/component-definitions';
    for (const role of ['HR', 'FINANCE', 'EMPLOYEE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
    }
    await request(app.getHttpServer())
      .get(path + '?asOf=2026-10-01')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['OWNER'],
    });
    const input = {
      code: 'BASIC',
      name: 'Basic salary',
      kind: 'EARNING',
      effectiveFrom: '2026-10-01',
      active: true,
      affectsGross: true,
      affectsNet: true,
      statutoryBases: ['EPF'],
      reason: 'Setup',
    };
    for (const change of [
      { code: 'bad code' },
      { effectiveFrom: '2026-10-02' },
      { statutoryBases: ['EPF', 'EPF'] },
      { statutoryBases: ['UNKNOWN'] },
      { pcbTreatment: 'UNKNOWN' },
      { companyId: 'foreign' },
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
    }
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer ' + token)
      .expect(400);
  });
  it('restricts manual payroll inputs and validates amounts and tenant injection', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/payroll/runs/00000000-0000-4000-8000-000000000001/inputs';
    for (const role of ['EMPLOYEE', 'HR']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .get(
          '/api/v1/payroll/runs/00000000-0000-4000-8000-000000000001/employees/00000000-0000-4000-8000-000000000002/input-preview',
        )
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    const input = {
      employeeId: '00000000-0000-4000-8000-000000000002',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
      componentCode: 'BONUS',
      amount: '100.00',
      reason: 'Bonus',
    };
    for (const change of [
      { amount: '-1' },
      { amount: '1.001' },
      { amount: '1e3' },
      { amount: 100 },
      { employeeId: 'bad' },
      { companyId: 'foreign' },
      { componentCode: 'bad code' },
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
    }
  });
  it('restricts claim allocation to payroll staff and validates allocation inputs', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/payroll/runs/00000000-0000-4000-8000-000000000001/claims/00000000-0000-4000-8000-000000000002';
    for (const role of ['HR', 'EMPLOYEE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .post(path + '/allocate')
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(path + '/release')
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    await request(app.getHttpServer())
      .post(path + '/allocate')
      .set('Authorization', 'Bearer ' + token)
      .send({ componentCode: 'bad code', reason: 'Allocate' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path + '/allocate')
      .set('Authorization', 'Bearer ' + token)
      .send({
        componentCode: 'REIMBURSEMENT',
        reason: 'Allocate',
        companyId: 'foreign',
      })
      .expect(400);
  });
  it('protects previous-employer tax declarations and validates money', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/employees/00000000-0000-4000-8000-000000000001/tax-openings';
    for (const role of ['EMPLOYEE', 'HR']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    const input = {
      year: 2026,
      effectiveMonth: 2,
      taxableIncome: '10000',
      employeeEpf: '1100',
      mtd: '100',
      zakat: '0',
      evidenceReference: 'TP3',
      reason: 'Reviewed',
    };
    for (const change of [
      { effectiveMonth: 13 },
      { taxableIncome: '-1' },
      { mtd: '1.001' },
      { companyId: 'foreign' },
    ])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
  });
  it('protects family declarations and validates nested child classifications', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/employees/00000000-0000-4000-8000-000000000001/tax-family';
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['EMPLOYEE'],
    });
    await request(app.getHttpServer())
      .get(path + '?year=2026')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['HR'],
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + token)
      .send({})
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    const input = {
      year: 2026,
      effectiveMonth: 1,
      residency: 'RESIDENT',
      category: 3,
      disabledIndividual: false,
      spouseReliefEligible: false,
      disabledSpouseReliefEligible: false,
      children: [],
      evidenceReference: 'Review',
      reason: 'Review',
    };
    for (const change of [
      { year: 2027 },
      { children: [{ reference: 'child', kind: 'UNKNOWN', share: 'FULL' }] },
      {
        children: [
          {
            reference: 'child',
            kind: 'STANDARD',
            share: 'FULL',
            amount: '99999',
          },
        ],
      },
      { companyId: 'foreign' },
    ])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
  });
  it('previews TP1 shared caps for finance and rejects invalid expense codes', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path = '/api/v1/statutory/pcb/tp1-preview';
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['EMPLOYEE'],
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + token)
      .send({})
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    const input = {
      year: 2026,
      amounts: { C10: '4000', C11A: '4000', C11B: '5000' },
      spouseRelief: '4000',
      projectedMandatoryEpf: '3500',
    };
    const result = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + token)
      .send(input)
      .expect(201);
    expect(result.body.data.total).toBe('3500.00');
    for (const change of [
      { amounts: { UNKNOWN: '1' } },
      { amounts: { C4C: '-1' } },
      { projectedMandatoryEpf: '4001' },
      { amounts: { C16A: '1', C16B: '1' } },
    ])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
  });
  it('protects saved TP1 declarations and rejects caller-supplied allowance context', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/employees/00000000-0000-4000-8000-000000000001/tax-expenses';
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['EMPLOYEE'],
    });
    await request(app.getHttpServer())
      .get(path + '?year=2026')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['HR'],
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + token)
      .send({})
      .expect(403);
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['FINANCE'],
    });
    const input = {
      year: 2026,
      effectiveMonth: 1,
      amounts: {},
      evidenceReference: 'Review',
      reason: 'Review',
    };
    for (const change of [
      { year: 2027 },
      { amounts: { UNKNOWN: '1' } },
      { projectedMandatoryEpf: '0' },
      { companyId: 'foreign' },
    ])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
  });
  it('restricts profile writes and validates contribution-month history inputs', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const path =
      '/api/v1/employees/00000000-0000-4000-8000-000000000001/payroll-profile';
    for (const role of ['EMPLOYEE', 'FINANCE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
      if (role === 'EMPLOYEE')
        await request(app.getHttpServer())
          .get(path + '/history')
          .set('Authorization', 'Bearer ' + token)
          .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['HR'],
    });
    const input = {
      effectiveFrom: '2026-10-01',
      reason: 'Confirmed enrollment',
      lindungParticipation: 'ENROLLED',
      epfCategory: 'PART_A',
      socsoCategory: 'CATEGORY_ONE',
      eisCategory: 'ELIGIBLE',
      lindungCategory: 'PHASE_ONE',
      pcbCategory: 'STANDARD',
      hrdCategory: 'EXEMPT',
    };
    for (const change of [
      { effectiveFrom: '2026-10-02' },
      { lindungParticipation: 'UNKNOWN' },
      { reason: '' },
      { revision: 100 },
    ]) {
      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
    }
  });
  it('previews PCB for finance and rejects unprivileged or invalid inputs', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    const input = {
      year: 2026,
      month: 1,
      residency: 'RESIDENT',
      category: 3,
      normal: '5500',
      additional: '0',
      normalEpf: '605',
      additionalEpf: '0',
      accumulatedIncome: '0',
      accumulatedEpf: '0',
      accumulatedMtd: '0',
      accumulatedZakat: '0',
      currentZakat: '0',
      qualifyingReliefs: '15000',
    };
    for (const role of ['HR', 'EMPLOYEE', 'FINANCE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      const response = await request(app.getHttpServer())
        .post('/api/v1/statutory/pcb/preview')
        .set('Authorization', 'Bearer ' + token)
        .send(input)
        .expect(role === 'FINANCE' ? 201 : 403);
      if (role === 'FINANCE')
        expect(response.body.data).toMatchObject({
          amount: '110.00',
          checksumKind: 'ORIGINAL_PDF',
        });
    }
    for (const change of [
      { year: 2027 },
      { normal: 5500 },
      { qualifyingReliefs: '-1' },
      { category: 4 },
      { extra: true },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/statutory/pcb/preview')
        .set('Authorization', 'Bearer ' + token)
        .send({ ...input, ...change })
        .expect(400);
    }
  });
  it('allows finance to review the catalog but reserves imports for owners', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    for (const role of ['HR', 'EMPLOYEE', 'FINANCE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .post('/api/v1/statutory/rulesets/catalog/EIS_2024_10/import')
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
      const result = await request(app.getHttpServer())
        .get('/api/v1/statutory/rulesets/catalog')
        .set('Authorization', 'Bearer ' + token)
        .expect(role === 'FINANCE' ? 200 : 403);
      if (role === 'FINANCE') expect(result.body.data).toHaveLength(8);
      await request(app.getHttpServer())
        .post(
          '/api/v1/statutory/rulesets/00000000-0000-4000-8000-000000000001/retire',
        )
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
    }
  });
  it('protects employee balance lookup and validates the year', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    for (const role of ['EMPLOYEE', 'FINANCE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .get(
          '/api/v1/leave/employees/00000000-0000-4000-8000-000000000001/balances',
        )
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['EMPLOYEE'],
    });
    const result = await request(app.getHttpServer())
      .get('/api/v1/leave/me/balances?year=invalid')
      .set('Authorization', 'Bearer ' + token)
      .expect(400);
    expect(
      result.body.errors.some(
        (error: { field: string }) => error.field === 'year',
      ),
    ).toBe(true);
  });
  it('restricts account administration to owners and rejects invalid owner input', async () => {
    const token = await app.get(JwtService).signAsync({
      sub: 'user',
      companyId: 'company',
      membershipId: 'membership',
      version: 0,
    });
    for (const role of ['HR', 'FINANCE', 'EMPLOYEE']) {
      db.membership.findFirst.mockResolvedValue({
        companyId: 'company',
        userId: 'user',
        roles: [role],
      });
      await request(app.getHttpServer())
        .post('/api/v1/memberships')
        .set('Authorization', 'Bearer ' + token)
        .send({})
        .expect(403);
    }
    db.membership.findFirst.mockResolvedValue({
      companyId: 'company',
      userId: 'user',
      roles: ['OWNER'],
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Authorization', 'Bearer ' + token)
      .send({ email: 'hr@example.test', password: 'short', roles: [] })
      .expect(400);
    expect(
      response.body.errors.map((error: { field: string }) => error.field),
    ).toEqual(expect.arrayContaining(['password', 'roles']));
  });
});
