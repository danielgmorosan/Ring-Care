/**
 * device_command_acks (F2.6) — a guardian's acknowledgement that it carried out a
 * command, closing the loop behind remote wipe.
 *
 * Append-only proof of what actually happened on the device (executed | failed), one
 * per command (rules #2, #7). The device authenticates with its per-device token, the
 * same credential it uses for heartbeats.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('device_command_acks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    command_id: { type: 'uuid', notNull: true, references: 'device_commands', onDelete: 'CASCADE' },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    // 'executed' | 'failed'.
    status: { type: 'text', notNull: true },
    detail: { type: 'text' },
    acked_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // One ack per command (idempotent re-send).
  pgm.createIndex('device_command_acks', 'command_id', { unique: true });

  // Append-only: block UPDATE/DELETE (row) and TRUNCATE (statement), reusing the shared
  // guard function (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER device_command_acks_append_only
      BEFORE UPDATE OR DELETE ON device_command_acks
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER device_command_acks_no_truncate
      BEFORE TRUNCATE ON device_command_acks
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON device_command_acks FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('device_command_acks');
};
