import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from './request-context';
import { requestIdMiddleware } from './request-id.middleware';

function fakeReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as Request;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('requestIdMiddleware', () => {
  it('generates an id, sets the header, and exposes it in context', () => {
    const { req, res, setHeader } = fakeReqRes();
    let inContext: string | undefined;

    requestIdMiddleware(req, res, (() => {
      inContext = getRequestId();
    }) as NextFunction);

    const [header, value] = setHeader.mock.calls[0]!;
    expect(header).toBe('X-Request-Id');
    expect(typeof value).toBe('string');
    expect(inContext).toBe(value); // the same id is available via async-local storage
  });

  it('echoes an incoming X-Request-Id so a trace spans hops', () => {
    const { req, res, setHeader } = fakeReqRes({ 'x-request-id': 'trace-abc-123' });
    requestIdMiddleware(req, res, (() => {}) as NextFunction);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-abc-123');
  });

  it('gives different requests different ids', () => {
    const a = fakeReqRes();
    const b = fakeReqRes();
    requestIdMiddleware(a.req, a.res, (() => {}) as NextFunction);
    requestIdMiddleware(b.req, b.res, (() => {}) as NextFunction);
    expect(a.setHeader.mock.calls[0]![1]).not.toBe(b.setHeader.mock.calls[0]![1]);
  });
});

@Controller('echo')
class EchoController {
  @Get()
  echo(): { requestId: string | undefined } {
    return { requestId: getRequestId() };
  }
}

describe('requestIdMiddleware over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the id in the header and it is readable inside the handler', async () => {
    const res = await request(app.getHttpServer()).get('/echo').expect(200);
    const header = res.headers['x-request-id'];
    expect(header).toBeTruthy();
    expect(res.body.requestId).toBe(header); // handler saw the same id via context
  });

  it('echoes a client-provided id end-to-end', async () => {
    const res = await request(app.getHttpServer())
      .get('/echo')
      .set('X-Request-Id', 'client-xyz')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('client-xyz');
    expect(res.body.requestId).toBe('client-xyz');
  });
});
