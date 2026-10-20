/**
 * Ring care logic (decision 0011): what a Ring event MEANS for the family.
 *
 * - visit_arrivals: the append-only record that an expected visitor arrived, from a
 *   front-door doorbell press or `human` motion inside the visit's window. One arrival
 *   per visit. The visitor label is copied in (like sighting_decisions) because
 *   expected_visits is editable configuration; deleting a visit never rewrites history,
 *   which is also why visit_id carries no foreign key.
 * - ring_care_decisions: the append-only judgement made for each front-door Ring event
 *   (opened a night door incident, joined one, recorded an arrival, or why it did
 *   neither). One row per ring event: the idempotency key, the audit that every
 *   suppression has its reason on record (rules #3 and #7), and the source of the
 *   `interpretation` shown on the Ring activity feed.
 * - incidents.device_id becomes nullable: a Ring incident is family-level, with no
 *   guardian behind it (the same widening alerts.device_id got in 1720000000026).
 *   Append-only on incidents is unchanged; this is DDL, not a row UPDATE.
 *
 * Labels, ids and times only (rule #1). Append-only guarded (rule #2), reusing the shared
 * guard function from 1720000000003.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('visit_arrivals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // The expected_visits row (no FK: visits are editable and may be deleted later).
    visit_id: { type: 'uuid', notNull: true },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // The ring_events row that marked the arrival.
    ring_event_id: { type: 'uuid', notNull: true },
    // Copy of the visit's label at arrival time ("Anna", "Nurse").
    visitor_label: { type: 'text', notNull: true },
    // When the visitor arrived (the Ring event's time).
    arrived_at: { type: 'timestamptz', notNull: true },
    recorded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // One arrival per visit.
  pgm.createIndex('visit_arrivals', 'visit_id', { unique: true });
  pgm.createIndex('visit_arrivals', 'ring_event_id');
  pgm.createIndex('visit_arrivals', ['family_id', 'arrived_at']);

  pgm.createTable('ring_care_decisions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    ring_event_id: { type: 'uuid', notNull: true },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // When the Ring event happened.
    at: { type: 'timestamptz', notNull: true },
    // 'night_door' | 'visit_arrival' | null (nothing for the family to act on).
    interpretation: { type: 'text' },
    // 'incident_opened' | 'joined_incident' | 'alerted_without_engine' | 'arrival_recorded'
    // | 'during_visit' | 'not_a_person' | 'daytime'.
    outcome: { type: 'text', notNull: true },
    incident_id: { type: 'uuid' },
    visit_id: { type: 'uuid' },
    recorded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // One decision per Ring event (idempotent on redelivery).
  pgm.createIndex('ring_care_decisions', 'ring_event_id', { unique: true });
  pgm.createIndex('ring_care_decisions', ['family_id', 'at']);

  for (const table of ['visit_arrivals', 'ring_care_decisions']) {
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

  pgm.alterColumn('incidents', 'device_id', { notNull: false });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.alterColumn('incidents', 'device_id', { notNull: true });
  pgm.dropTable('ring_care_decisions');
  pgm.dropTable('visit_arrivals');
};
