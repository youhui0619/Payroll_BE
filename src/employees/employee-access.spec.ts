import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import { Database, DatabaseModule } from '../database.module';
import { AuthGuard } from '../auth/auth.module';
import { EmployeesModule } from './employees.module';

describe('employee HTTP access', () => {
  let app: INestApplication;
  let roles: string[];
  const db = {
    membership: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, EmployeesModule],
    })
      .overrideProvider(Database)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalGuards(
      new AuthGuard(
        db as never,
        {
          verifyAsync: async () => ({
            sub: 'user',
            companyId: 'company',
            membershipId: 'membership',
            version: 0,
          }),
        } as never,
        module.get(Reflector),
      ),
    );
    await app.init();
  });
  beforeEach(() => {
    roles = ['EMPLOYEE'];
    db.membership.findFirst.mockImplementation(async () => ({
      id: 'membership',
      companyId: 'company',
      userId: 'user',
      employeeId: 'employee',
      roles,
    }));
    db.employee.findFirst.mockResolvedValue({
      id: 'employee',
      name: 'Employee',
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('requires login', async () => {
    await request(app.getHttpServer()).get('/api/v1/employees/me').expect(401);
  });
  it('resolves /me before the UUID route', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/employees/me')
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(result.body.data.id).toBe('employee');
  });
  it('prevents employees from listing staff', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', 'Bearer test')
      .expect(403);
  });
  it('prevents employees from reading another profile', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/employees/00000000-0000-4000-8000-000000000001')
      .set('Authorization', 'Bearer test')
      .expect(403);
  });
  it('prevents employees from creating accounts', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/employees/00000000-0000-4000-8000-000000000001/account')
      .set('Authorization', 'Bearer test')
      .send({ email: 'a@example.com', password: 'owner123' })
      .expect(403);
  });
  it('rejects role injection in an HR request', async () => {
    roles = ['HR'];
    await request(app.getHttpServer())
      .post('/api/v1/employees/00000000-0000-4000-8000-000000000001/account')
      .set('Authorization', 'Bearer test')
      .send({ email: 'a@example.com', password: 'owner123', roles: ['OWNER'] })
      .expect(400);
  });
});
