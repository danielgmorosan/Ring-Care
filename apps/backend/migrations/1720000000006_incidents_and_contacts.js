/**
 * Escalation engine (F1.4) schema.
 *
 * - incidents / incident_steps: the append-only audit trail of every escalation
 *   (rule #2). incidents holds the immutable opening facts; the lifecycle (voice
 *   check-in result, each call, SMS, emergency, stand-down/resolution) is recorded
 *   as append-only steps. Current status is derived from the latest step, never by
 *   UPDATE. Corrections are new rows referencing the original.
 * - family_contacts: the per-family ordered contact chain with roles and a
 *   quiet-hours contract. This is editable configuration, so it is NOT append-only.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('family_contacts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true },
    phone: { type: 'text' },
    push_token: { type: 'text' },
    // Position in the escalation chain; lower is called first.
    priority: { type: 'integer', notNull: true, default: 0 },
    // { start: "22:00", end: "07:00", wakeForConfirmedFallOnly: true } | null
    quiet_hours: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('family_contacts', ['family_id', 'priority']);

  pgm.createTable('incidents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'RESTRICT' },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    // The event_stream event that triggered this incident (event_id; not FK because
    // the hypertable key is composite).
    triggering_event_id: { type: 'uuid' },
    reason: { type: 'text', notNull: true },
    opened_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('incidents', 'family_id');

  pgm.createTable('incident_steps', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    incident_id: { type: 'uuid', notNull: true, references: 'incidents', onDelete: 'RESTRICT' },
    // Monotonic per-incident ordering, set by the deterministic workflow.
    seq: { type: 'integer', notNull: true },
    kind: { type: 'text', notNull: true },
    contact_id: { type: 'uuid', references: 'family_contacts', onDelete: 'SET NULL' },
    detail: { type: 'jsonb', notNull: true, default: '{}' },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('incident_steps', ['incident_id', 'seq']);
  pgm.sql(
    `CREATE UNIQUE INDEX incident_steps_incident_seq_uidx ON incident_steps (incident_id, seq);`,
  );

  // Append-only: incidents and their steps are the audit trail (rule #2).
  for (const table of ['incidents', 'incident_steps']) {
    pgm.sql(`
      CREATE TRIGGER ${table}_append_only
        BEFORE UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION raise_append_only();
      CREATE TRIGGER ${table}_no_truncate
        BEFORE TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
    `);
    pgm.sql(`REVOKE UPDATE, DELETE, TRUNCATE ON ${table} FROM PUBLIC;`);
  }
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('incident_steps');
  pgm.dropTable('incidents');
  pgm.dropTable('family_contacts');
};
