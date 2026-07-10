import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { DeviceCommandAck, DeviceCommandAckStatus } from './device-command-ack.entity';
import { DeviceCommandAckRepository, NewDeviceCommandAck } from './device-command-ack.repository';

interface AckRow extends QueryResultRow {
  id: string;
  command_id: string;
  device_id: string;
  status: string;
  detail: string | null;
  acked_at: Date;
  created_at: Date;
}

function toAck(r: AckRow): DeviceCommandAck {
  return {
    id: r.id,
    commandId: r.command_id,
    deviceId: r.device_id,
    status: r.status as DeviceCommandAckStatus,
    detail: r.detail,
    ackedAt: r.acked_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgDeviceCommandAckRepository implements DeviceCommandAckRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(ack: NewDeviceCommandAck): Promise<void> {
    // Idempotent on command_id: a re-sent ack records once. Append-only (trigger + revoke).
    await this.pool.query(
      `INSERT INTO device_command_acks (command_id, device_id, status, detail, acked_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (command_id) DO NOTHING`,
      [ack.commandId, ack.deviceId, ack.status, ack.detail, ack.ackedAt],
    );
  }

  async latestByCommandIds(commandIds: string[]): Promise<Map<string, DeviceCommandAck>> {
    if (commandIds.length === 0) return new Map();
    const { rows } = await this.pool.query<AckRow>(
      `SELECT id, command_id, device_id, status, detail, acked_at, created_at
       FROM device_command_acks WHERE command_id = ANY($1::uuid[])`,
      [commandIds],
    );
    return new Map(rows.map((r) => [r.command_id, toAck(r)]));
  }
}
