/**
 * device_commands (F2.6) — the append-only record of backend → device commands a
 * caregiver issued, e.g. a remote wipe.
 *
 * A wipe is irreversible, so who wiped which guardian and when is a permanent record
 * (rule #7). The audit interceptor only knows the route pattern, not the target device;
 * this is where the target and the actor are captured. Append-only guarded (rule #2).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('device_commands', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // 'wipe' (more command kinds join later: OTA trigger, config).
    command: { type: 'text', notNull: true },
    // The caregiver who issued it (references the users table by id).
    issued_by_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    issued_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('device_commands', ['family_id', 'device_id', 'issued_at']);

  // Append-only: block UPDATE/DELETE (row) and TRUNCATE (statement), reusing the shared
  // guard function (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER device_commands_append_only
      BEFORE UPDATE OR DELETE ON device_commands
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER device_commands_no_truncate
      BEFORE TRUNCATE ON device_commands
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON device_commands FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('device_commands');
};
