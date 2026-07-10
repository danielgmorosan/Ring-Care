/**
 * alerts (F2) — the append-only trail of every family-facing alert the system
 * delivered: a stranger, a hazard-zone entry, a doorway crossing at an unusual hour, or
 * someone who left and did not return.
 *
 * One record per alert, immutable — the "what have we been alerted about" surface and
 * the audit that every alert was raised (rules #2, #7). Labels and text only (rule #1).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('alerts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    // 'stranger' | 'hazard_zone' | 'door_unusual_hour' | 'wander'.
    kind: { type: 'text', notNull: true },
    message: { type: 'text', notNull: true },
    // The source id (triggering event id, or wander-watch id); the idempotency key.
    ref: { type: 'text', notNull: true },
    // When the alerting condition happened.
    at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // One alert per source condition (idempotent re-raise).
  pgm.createIndex('alerts', ['ref', 'kind'], { unique: true });
  // The family read side, newest first.
  pgm.createIndex('alerts', ['family_id', 'at']);

  // Append-only: block UPDATE/DELETE (row) and TRUNCATE (statement), reusing the shared
  // guard function (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER alerts_append_only
      BEFORE UPDATE OR DELETE ON alerts
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER alerts_no_truncate
      BEFORE TRUNCATE ON alerts
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON alerts FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('alerts');
};
