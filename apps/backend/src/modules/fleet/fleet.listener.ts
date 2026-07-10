import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InternalEvent, type DeviceRegisteredPayload } from '../../internal-events/internal-events';

/**
 * Demonstrates the internal event bus: fleet reacts to devices registering in the
 * devices module without any direct call or HTTP between them. Fleet health/roster
 * tracking (F2.6) builds on this seam.
 */
@Injectable()
export class FleetListener {
  private readonly logger = new Logger(FleetListener.name);

  @OnEvent(InternalEvent.DeviceRegistered)
  onDeviceRegistered(payload: DeviceRegisteredPayload): void {
    this.logger.log(`Device ${payload.deviceId} joined the fleet for family ${payload.familyId}`);
  }
}
