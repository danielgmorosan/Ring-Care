import { randomUUID } from 'node:crypto';
import type { RingClient, RingDevice, RingLiveSession } from './ring-client.port';

/**
 * Stand-in when Ring is not linked (mode 'off'), and a fake for tests. Calls nothing.
 * The service refuses sync/live in 'off' mode, so in production wiring this is inert.
 */
export class MockRingClient implements RingClient {
  devices: RingDevice[] = [];
  readonly opened: Array<{ ringDeviceId: string; sessionId: string }> = [];
  readonly closed: Array<{ ringDeviceId: string; sessionId: string }> = [];

  async listDevices(): Promise<RingDevice[]> {
    return this.devices.map((d) => ({ ...d }));
  }

  async startLiveView(ringDeviceId: string, _sdpOffer: string): Promise<RingLiveSession> {
    const sessionId = randomUUID();
    this.opened.push({ ringDeviceId, sessionId });
    return {
      sessionId,
      sdpAnswer: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=mock\r\nt=0 0\r\n',
      location: `mock://ring/${ringDeviceId}/${sessionId}`,
    };
  }

  async stopLiveView(ringDeviceId: string, sessionId: string): Promise<void> {
    this.closed.push({ ringDeviceId, sessionId });
  }
}
