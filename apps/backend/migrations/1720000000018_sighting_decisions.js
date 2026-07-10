/**
 * sighting_decisions (F2.4) — the append-only record of stranger/uniform decisions.
 *
 * When a guardian sees an unknown person, the deterministic rule judges whether they
 * were expected (an active system-initiated emergency, or a pre-logged visit) or a
 * stranger. Each judgement is recorded here, immutably. This is the audit trail that
 * makes rule #5 provable — a suppression can never exist without its justifying reason
 * in the log — and satisfies rule #7. Labels and ids only (rule #1). Append-only
 * guarded (rule #2), like event_stream and the incident trail.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('sighting_decisions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    // The triggering person.unknown event id; the idempotency key.
    event_id: { type: 'uuid', notNull: true },
    // When the device saw the person (device clock).
    at: { type: 'timestamptz', notNull: true },
    uniformed: { type: 'boolean', notNull: true },
    // 'expected' | 'stranger'.
    decision: { type: 'text', notNull: true },
    // 'system_emergency' | 'expected_visit' | 'none'.
    reason: { type: 'text', notNull: true },
    // The matched visit's label when reason is expected_visit; else null.
    visit_label: { type: 'text' },
    recorded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // One decision per triggering event (idempotent replay).
  pgm.createIndex('sighting_decisions', 'event_id', { unique: true });
  // The family read side, newest first.
  pgm.createIndex('sighting_decisions', ['family_id', 'at']);

  // Append-only: block UPDATE/DELETE (row level) and TRUNCATE (statement level),
  // reusing the shared guard function (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER sighting_decisions_append_only
      BEFORE UPDATE OR DELETE ON sighting_decisions
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER sighting_decisions_no_truncate
      BEFORE TRUNCATE ON sighting_decisions
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON sighting_decisions FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('sighting_decisions');
};
