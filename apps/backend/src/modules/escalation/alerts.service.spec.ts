import type { PushTokensService } from '../push/push-tokens.service';
import { AlertsService } from './alerts.service';
import type { NewAlert } from './alert.repository';
import { InMemoryAlertRepository } from './in-memory-alert.repository';
import type { PushPort } from './notifications/push.port';
import type { DeviceAlertInput } from './temporal/types';

const FAMILY = 'fam-1';

function alert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    familyId: FAMILY,
    deviceId: 'device-1',
    kind: 'stranger',
    message: 'Someone we do not recognize is at the home. Open the app to take a look.',
    ref: 'evt-1',
    at: '2026-07-09T15:00:00.000Z',
    ...overrides,
  };
}

describe('AlertsService', () => {
  let service: AlertsService;
  let repo: InMemoryAlertRepository;
  let pushed: DeviceAlertInput[];
  let failDelivery: boolean;

  beforeEach(() => {
    repo = new InMemoryAlertRepository();
    pushed = [];
    failDelivery = false;
    const pushTokens = {
      listForFamily: async (fid: string) =>
        fid === FAMILY ? [{ token: 'token-a' }, { token: 'token-b' }] : [],
    } as unknown as PushTokensService;
    const push = {
      pushToDevice: async (input: DeviceAlertInput) => {
        if (failDelivery) throw new Error('fcm down');
        pushed.push(input);
      },
    } as unknown as PushPort;
    service = new AlertsService(repo, pushTokens, push);
  });

  it('records the alert and delivers it to every family device', async () => {
    await service.raise(alert());

    const [recorded] = await service.list(FAMILY);
    expect(recorded).toMatchObject({ kind: 'stranger', ref: 'evt-1' });
    expect(pushed.map((p) => p.token).sort()).toEqual(['token-a', 'token-b']);
    expect(pushed[0]!.message).toBe(recorded!.message);
    expect(pushed[0]!.incidentId).toBe('evt-1'); // ref rides as the correlation id
  });

  it('is idempotent on (ref, kind): a re-raise records once', async () => {
    await service.raise(alert());
    await service.raise(alert());

    expect(await service.list(FAMILY)).toHaveLength(1);
  });

  it('records the alert even when delivery to every device fails', async () => {
    failDelivery = true;

    await expect(service.raise(alert())).resolves.toBeUndefined();

    expect(await service.list(FAMILY)).toHaveLength(1); // recorded despite no delivery
    expect(pushed).toHaveLength(0);
  });

  it('lists a family’s alerts newest first and never another family’s', async () => {
    await service.raise(alert({ ref: 'evt-early', at: '2026-07-09T10:00:00.000Z' }));
    await service.raise(alert({ ref: 'evt-late', at: '2026-07-09T20:00:00.000Z' }));
    await service.raise(alert({ familyId: 'other-fam', ref: 'evt-other' }));

    const mine = await service.list(FAMILY);
    expect(mine.map((a) => a.ref)).toEqual(['evt-late', 'evt-early']);
  });
});
