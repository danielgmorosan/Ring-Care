import { Inject, Injectable } from '@nestjs/common';
import type { DeviceCommandType } from '@obrigada/shared';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { DeviceCommand } from './device-command.entity';
import { DeviceCommandRepository, NewDeviceCommand } from './device-command.repository';

interface CommandRow extends QueryResultRow {
  id: string;
  device_id: string;
  family_id: string;
  command: string;
  issued_by_user_id: string;
  issued_at: Date;
  created_at: Date;
}

const COLUMNS = 'id, device_id, family_id, command, issued_by_user_id, issued_at, created_at';

function toCommand(r: CommandRow): DeviceCommand {
  return {
    id: r.id,
    deviceId: r.device_id,
    familyId: r.family_id,
    command: r.command as DeviceCommandType,
    issuedByUserId: r.issued_by_user_id,
    issuedAt: r.issued_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgDeviceCommandRepository implements DeviceCommandRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(command: NewDeviceCommand): Promise<DeviceCommand> {
    const { rows } = await this.pool.query<CommandRow>(
      `INSERT INTO device_commands (device_id, family_id, command, issued_by_user_id, issued_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        command.deviceId,
        command.familyId,
        command.command,
        command.issuedByUserId,
        command.issuedAt,
      ],
    );
    return toCommand(rows[0]!);
  }

  async listByDevice(familyId: string, deviceId: string): Promise<DeviceCommand[]> {
    const { rows } = await this.pool.query<CommandRow>(
      `SELECT ${COLUMNS} FROM device_commands
       WHERE family_id = $1 AND device_id = $2 ORDER BY issued_at DESC`,
      [familyId, deviceId],
    );
    return rows.map(toCommand);
  }

  async findById(id: string): Promise<DeviceCommand | null> {
    const { rows } = await this.pool.query<CommandRow>(
      `SELECT ${COLUMNS} FROM device_commands WHERE id = $1`,
      [id],
    );
    return rows[0] ? toCommand(rows[0]) : null;
  }
}
