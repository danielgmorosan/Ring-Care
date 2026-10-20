/** A device from Ring's `GET /v1/devices`, reduced to what we keep. */
export interface RingDevice {
  id: string;
  name: string;
  online: boolean;
  /** Ring's device kind/model when given (e.g. 'doorbell'); used only to suggest placement. */
  kind: string | null;
}

/** A WHEP live-view session: signalling only, the media flows Ring ↔ family app. */
export interface RingLiveSession {
  sessionId: string;
  sdpAnswer: string;
  /** The session resource URL from Ring's Location header, used to close it. */
  location: string;
}

/** Ring rejected the call or misbehaved (status is Ring's HTTP status, 0 on network error). */
export class RingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RingApiError';
  }
}

/** Ring answered 503 for a device: the camera is offline or asleep. */
export class RingDeviceOfflineError extends RingApiError {
  constructor(message = 'Ring device is offline') {
    super(message, 503);
    this.name = 'RingDeviceOfflineError';
  }
}

/**
 * The Ring Partner API (Amazon Vision) as the rest of the module sees it. Never fetches
 * snapshots or clips (rule #1).
 */
export interface RingClient {
  listDevices(): Promise<RingDevice[]>;
  startLiveView(ringDeviceId: string, sdpOffer: string): Promise<RingLiveSession>;
  stopLiveView(ringDeviceId: string, sessionId: string, location?: string): Promise<void>;
}

export const RING_CLIENT = Symbol('RING_CLIENT');
