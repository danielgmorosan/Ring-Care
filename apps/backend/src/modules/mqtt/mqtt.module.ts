import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { FleetModule } from '../fleet/fleet.module';
import { MqttIngestionService } from './mqtt-ingestion.service';

/**
 * Device link (F0.3). Connects to the EMQX broker over mutual-TLS MQTT and routes
 * device events/heartbeats into the events and fleet modules. Disabled when
 * MQTT_URL is unset.
 */
@Module({
  imports: [EventsModule, FleetModule],
  providers: [MqttIngestionService],
  exports: [MqttIngestionService],
})
export class MqttModule {}
