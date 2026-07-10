import type { NotificationPort } from './notification.port';
import type { PushPort } from './push.port';
import { CompositeNotificationAdapter } from './composite-notification.adapter';
import type { ContactMessageInput, EscalationContact, PlaceCallInput } from '../temporal/types';

const contact: EscalationContact = {
  id: 'c1',
  name: 'Ana',
  role: 'daughter',
  phone: '+351920000000',
  pushToken: 'tok',
  priority: 1,
  quietHours: null,
};

describe('CompositeNotificationAdapter', () => {
  let comms: jest.Mocked<NotificationPort>;
  let push: jest.Mocked<PushPort>;
  let composite: CompositeNotificationAdapter;

  beforeEach(() => {
    comms = {
      placeCall: jest.fn().mockResolvedValue({ answered: false }),
      sendSms: jest.fn().mockResolvedValue(undefined),
      pushCriticalAlert: jest.fn().mockResolvedValue(undefined),
      pushDeviceAlert: jest.fn().mockResolvedValue(undefined),
      notifyEmergency: jest.fn().mockResolvedValue(undefined),
    };
    push = {
      pushCriticalAlert: jest.fn().mockResolvedValue(undefined),
      pushToDevice: jest.fn().mockResolvedValue(undefined),
    };
    composite = new CompositeNotificationAdapter(comms, push);
  });

  it('routes calls, SMS, and emergency to the comms adapter', async () => {
    const call: PlaceCallInput = { incidentId: 'i1', contact, ringSeconds: 45 };
    const msg: ContactMessageInput = { incidentId: 'i1', contact, message: 'hi' };

    await composite.placeCall(call);
    await composite.sendSms(msg);
    await composite.notifyEmergency({ incidentId: 'i1', summary: 'fall' });

    expect(comms.placeCall).toHaveBeenCalledWith(call);
    expect(comms.sendSms).toHaveBeenCalledWith(msg);
    expect(comms.notifyEmergency).toHaveBeenCalled();
  });

  it('routes critical push to the push adapter, not the comms adapter', async () => {
    const msg: ContactMessageInput = { incidentId: 'i1', contact, message: 'A fall at home.' };

    await composite.pushCriticalAlert(msg);

    expect(push.pushCriticalAlert).toHaveBeenCalledWith(msg);
    expect(comms.pushCriticalAlert).not.toHaveBeenCalled();
  });

  it('routes a device critical alert to the push adapter', async () => {
    const alert = { incidentId: 'i1', token: 'device-token', message: 'A fall at home.' };

    await composite.pushDeviceAlert(alert);

    expect(push.pushToDevice).toHaveBeenCalledWith(alert);
    expect(comms.pushDeviceAlert).not.toHaveBeenCalled();
  });
});
