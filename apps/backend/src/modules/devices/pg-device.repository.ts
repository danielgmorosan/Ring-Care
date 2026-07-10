import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import { Device, DeviceStatus } from './device.entity';
import { DeviceRepository } from './device.repository';

interface DeviceRow extends QueryResultRow {
  id: string;
  family_id: string;
  name: string;
  status: DeviceStatus;
  registered_at: Date;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    status: row.status,
    registeredAt: row.registered_at.toISOString(),
  };
}

/** Postgres/TimescaleDB-backed adapter. Same port as the in-memory one (F0.1). */
@Injectable()
export class PgDeviceRepository implements DeviceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(device: Device): Promise<Device> {
    const { rows } = await this.pool.query<DeviceRow>(
      `INSERT INTO devices (id, family_id, name, status, registered_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, family_id, name, status, registered_at`,
      [device.id, device.familyId, device.name, device.status, device.registeredAt],
    );
    return toDevice(rows[0]!);
  }

  async findById(id: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, family_id, name, status, registered_at FROM devices WHERE id = $1`,
      [id],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async findByFamily(familyId: string): Promise<Device[]> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, family_id, name, status, registered_at
       FROM devices WHERE family_id = $1 ORDER BY registered_at ASC`,
      [familyId],
    );
    return rows.map(toDevice);
  }

  async findAll(): Promise<Device[]> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, family_id, name, status, registered_at FROM devices ORDER BY registered_at ASC`,
    );
    return rows.map(toDevice);
  }

  async updateStatus(id: string, status: DeviceStatus): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `UPDATE devices SET status = $2 WHERE id = $1
       RETURNING id, family_id, name, status, registered_at`,
      [id, status],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async setHeartbeatTokenHash(id: string, tokenHash: string): Promise<void> {
    await this.pool.query(`UPDATE devices SET heartbeat_token_hash = $2 WHERE id = $1`, [
      id,
      tokenHash,
    ]);
  }

  async getHeartbeatTokenHash(id: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ heartbeat_token_hash: string | null }>(
      `SELECT heartbeat_token_hash FROM devices WHERE id = $1`,
      [id],
    );
    return rows[0]?.heartbeat_token_hash ?? null;
  }

  async redactNamesByFamily(familyId: string): Promise<void> {
    await this.pool.query(`UPDATE devices SET name = 'Erased device' WHERE family_id = $1`, [
      familyId,
    ]);
  }
}
