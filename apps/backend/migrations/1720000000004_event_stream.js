/**
 * event_stream: the append-only, high-volume derived-event log from guardian
 * devices. Carries labels, timestamps, keypoints, and confidences only — never
 * pixels, never raw audio (rule #1). A TimescaleDB hypertable partitioned by the
 * device-side event time, and append-only-guarded (rule #2).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('event_stream', {
    // Device-side event time; also the hypertable partition key.
    occurred_at: { type: 'timestamptz', notNull: true },
    // Server receive time, for lag/observability.
    ingested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    // Client-generated id so offline queue-and-replay is idempotent (dedup in F0.3).
    event_id: { type: 'uuid', notNull: true },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    type: { type: 'text', notNull: true },
    confidence: { type: 'double precision' },
    keypoints: { type: 'jsonb' },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
  });

  // Turn it into a hypertable partitioned by occurred_at.
  pgm.sql(`SELECT create_hypertable('event_stream', by_range('occurred_at'));`);

  // Idempotency key. On a hypertable, unique constraints must include the
  // partition column, so we key on (event_id, occurred_at) — an event's time is
  // fixed on the device, so this dedups replays.
  pgm.sql(`
    CREATE UNIQUE INDEX event_stream_event_id_occurred_at_uidx
      ON event_stream (event_id, occurred_at);
  `);
  pgm.createIndex('event_stream', ['device_id', 'occurred_at']);

  // Append-only: block UPDATE/DELETE (row level) and TRUNCATE (statement level).
  pgm.sql(`
    CREATE TRIGGER event_stream_append_only
      BEFORE UPDATE OR DELETE ON event_stream
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER event_stream_no_truncate
      BEFORE TRUNCATE ON event_stream
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);

  // Defense-in-depth: no role should hold UPDATE/DELETE here. Production runs the
  // app under a restricted login role (see docs/decisions); the trigger is the
  // absolute guarantee regardless of role.
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON event_stream FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('event_stream');
};
