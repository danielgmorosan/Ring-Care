import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryPushTokenRepository } from './in-memory-push-token.repository';
import { PushTokensService } from './push-tokens.service';

describe('PushTokensService', () => {
  let families: FamiliesService;
  let service: PushTokensService;
  let familyId: string;
  let userId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new PushTokensService(new InMemoryPushTokenRepository(), families);
    const family = await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' });
    familyId = family.id;
    userId = '00000000-0000-4000-8000-0000000000u1';
  });

  it('registers a device token and lists it for the family', async () => {
    const registered = await service.register(userId, familyId, {
      token: 'device-abc',
      platform: 'ios',
    });
    expect(registered.token).toBe('device-abc');
    expect(registered.familyId).toBe(familyId);

    const list = await service.listForFamily(familyId);
    expect(list.map((t) => t.token)).toEqual(['device-abc']);
  });

  it('upserts on re-registration (same device token keeps one row)', async () => {
    const first = await service.register(userId, familyId, { token: 'dev', platform: 'android' });
    const second = await service.register(userId, familyId, { token: 'dev', platform: 'ios' });

    expect(second.id).toBe(first.id);
    expect(second.platform).toBe('ios');
    expect(await service.listForFamily(familyId)).toHaveLength(1);
  });

  it('unregisters a device token', async () => {
    await service.register(userId, familyId, { token: 'dev', platform: 'web' });
    await service.unregister(familyId, 'dev');
    expect(await service.listForFamily(familyId)).toHaveLength(0);
  });

  it('rejects registration for an unknown family', async () => {
    await expect(
      service.register(userId, '00000000-0000-4000-8000-000000000099', {
        token: 'x',
        platform: 'ios',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
