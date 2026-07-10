import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { requestIdMiddleware } from './request-id.middleware';

@Controller('boom')
class BoomController {
  @Get('http')
  http(): never {
    throw new NotFoundException('no such family');
  }

  @Get('validation')
  validation(): never {
    throw new BadRequestException(['name must not be empty']);
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail');
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('wraps an HttpException in the envelope with the request id and path', async () => {
    const res = await request(app.getHttpServer()).get('/boom/http').expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'no such family',
      requestId: res.headers['x-request-id'],
      timestamp: expect.any(String),
      path: '/boom/http',
    });
  });

  it('preserves the validation-error message array (client compatibility)', async () => {
    const res = await request(app.getHttpServer()).get('/boom/validation').expect(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.message).toEqual(['name must not be empty']);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns a generic 500 for an unexpected error without leaking internals', async () => {
    const res = await request(app.getHttpServer()).get('/boom/crash').expect(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
