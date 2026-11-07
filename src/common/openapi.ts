import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function openApi(app: INestApplication) {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Payroll API')
      .setVersion('0.1.0')
      .setDescription(
        'Multi-company payroll API. Monetary amounts are decimal strings. Requests use the company in the authenticated membership.',
      )
      .addBearerAuth()
      .build(),
  );
  doc.components.schemas.ApiError = {
    type: 'object',
    required: ['code', 'message', 'requestId'],
    properties: {
      code: { type: 'string', example: 'LEAVE_BALANCE_INSUFFICIENT' },
      message: { type: 'string' },
      requestId: { type: 'string', format: 'uuid' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  };
  const ids = new Set<string>();
  for (const item of Object.values(doc.paths))
    for (const verb of ['get', 'post', 'patch', 'put', 'delete']) {
      const op = item[verb];
      if (!op) continue;
      if (!op.operationId || ids.has(op.operationId))
        throw new Error('Duplicate or missing operation ID');
      ids.add(op.operationId);
      for (const status of [
        '400',
        '401',
        '403',
        '404',
        '409',
        '422',
        '429',
        '500',
      ])
        op.responses[status] ??= {
          description: 'Standard API error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        };
    }
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (
        key === '$ref' &&
        typeof item === 'string' &&
        item.startsWith('#/components/schemas/') &&
        !doc.components.schemas[item.split('/').pop()]
      )
        throw new Error('Unresolved OpenAPI schema ' + item);
      visit(item);
    }
  };
  visit(doc);
  return doc;
}
