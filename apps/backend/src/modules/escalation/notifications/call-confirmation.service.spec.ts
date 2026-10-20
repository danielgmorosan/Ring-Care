import { ForbiddenException } from '@nestjs/common';
import type { AppConfig } from '../../../config/env.validation';
import type { EscalationService } from '../escalation.service';
import { buildConfirmUrl, deriveCallbackKey, twilioSignature } from './call-confirmation';
import { CallConfirmationService } from './call-confirmation.service';

const NOW = Date.parse('2026-07-15T02:05:00Z');
const AUTH_TOKEN = 'twilio-auth-token';

function setup(opts: { authToken?: string; confirm?: jest.Mock } = {}) {
  const config = {
    jwtSecret: 'jwt-secret',
    callbackSigningSecret: 'callback-secret-0123',
    twilioAuthToken: 'authToken' in opts ? opts.authToken : AUTH_TOKEN,
  } as unknown as AppConfig;
  const confirmByCall = opts.confirm ?? jest.fn().mockResolvedValue(undefined);
  const escalation = { confirmByCall } as unknown as EscalationService;
  const service = new CallConfirmationService(config, escalation);
  const key = deriveCallbackKey({
    jwtSecret: 'jwt-secret',
    callbackSigningSecret: 'callback-secret-0123',
  });
  const link = (incidentId = 'inc-1', contactId = 'miguel', exp = NOW / 1000 + 3600): URL =>
    new URL(
      buildConfirmUrl({
        publicBaseUrl: 'https://obrigada.example',
        key,
        incidentId,
        contactId,
        exp,
      }),
    );
  /** A request exactly as Twilio would send it for `url` with `body`. */
  const request = (url: URL, body: Record<string, string>, signature?: string) => ({
    url: url.toString(),
    query: Object.fromEntries(url.searchParams),
    body,
    twilioSignature: signature ?? twilioSignature(AUTH_TOKEN, url.toString(), body),
  });
  return { service, confirmByCall, link, request };
}

const body = (digits?: string): Record<string, string> => ({
  AccountSid: 'AC1',
  CallSid: 'CA1',
  ...(digits !== undefined ? { Digits: digits } : {}),
});

describe('CallConfirmationService', () => {
  it('press 1 on a genuine Twilio request signals the workflow and thanks the caller', async () => {
    const { service, confirmByCall, link, request } = setup();
    const twiml = await service.handle(request(link(), body('1')), NOW);
    expect(confirmByCall).toHaveBeenCalledWith('inc-1', 'miguel');
    expect(twiml).toBe(
      '<Response><Say voice="alice">Thank you. We have let the family know you are handling it.</Say></Response>',
    );
  });

  it('rejects a forged or altered link (bad HMAC) without touching the workflow', async () => {
    const { service, confirmByCall, link, request } = setup();
    const url = link();
    url.searchParams.set('contact', 'sofia'); // token was signed for miguel
    await expect(service.handle(request(url, body('1')), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const noToken = link();
    noToken.searchParams.delete('token');
    await expect(service.handle(request(noToken, body('1')), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('rejects an expired link', async () => {
    const { service, confirmByCall, link, request } = setup();
    const url = link('inc-1', 'miguel', NOW / 1000 - 1);
    await expect(service.handle(request(url, body('1')), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('rejects a bad or missing X-Twilio-Signature when the auth token is configured', async () => {
    const { service, confirmByCall, link, request } = setup();
    await expect(
      service.handle(request(link(), body('1'), 'bm90LWEtc2lnbmF0dXJl'), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const unsigned = { ...request(link(), body('1')), twilioSignature: undefined };
    await expect(service.handle(unsigned, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    // A signature computed over a different digit does not cover a "1".
    const url = link();
    const sigForTwo = twilioSignature(AUTH_TOKEN, url.toString(), body('2'));
    await expect(service.handle(request(url, body('1'), sigForTwo), NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('relies on the signed link alone when no Twilio auth token is configured', async () => {
    const { service, confirmByCall, link, request } = setup({ authToken: undefined });
    await service.handle({ ...request(link(), body('1')), twilioSignature: undefined }, NOW);
    expect(confirmByCall).toHaveBeenCalledTimes(1);
  });

  it('any other digit says a short line and hangs up; the workflow is not signalled', async () => {
    const { service, confirmByCall, link, request } = setup();
    const twiml = await service.handle(request(link(), body('2')), NOW);
    expect(twiml).toBe(
      '<Response><Say voice="alice">Thank you. We will keep trying the family. Goodbye.</Say><Hangup/></Response>',
    );
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('no input says a short line and hangs up', async () => {
    const { service, confirmByCall, link, request } = setup();
    const twiml = await service.handle(request(link(), body()), NOW);
    expect(twiml).toContain('We did not hear a response.');
    expect(twiml).toContain('<Hangup/>');
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('a press 1 after the incident has closed is answered politely, not as an error', async () => {
    const confirm = jest.fn().mockRejectedValue(new Error('workflow execution already completed'));
    const { service, link, request } = setup({ confirm });
    const twiml = await service.handle(request(link(), body('1')), NOW);
    expect(twiml).toContain('already closed');
  });
});
