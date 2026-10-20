/**
 * Ring cameras as a sensor source (docs/decisions/0011).
 *
 * `ring_cameras` is editable configuration: the family's linked Ring devices, where each
 * one sits (set by the caregiver) and its last known online state.
 *
 * `ring_events` is the append-only trail of every signed Ring webhook we accepted (rules
 * #2, #7). Labels and ids only (rule #1): no pixels, no snapshot or clip URLs, no raw
 * body. `ring_event_key` is Ring's own event id (or a digest of the body when Ring sent
 * none) and is the idempotency key, so a redelivered webhook records once.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('ring_cameras', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    ring_device_id: { type: 'text', notNull: true },
    // Empty until a device sync names it (webhook auto-created cameras start unnamed).
    name: { type: 'text', notNull: true, default: '' },
    placement: { type: 'text', notNull: true, default: 'other' },
    online: { type: 'boolean', notNull: true, default: true },
    last_event_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('ring_cameras', 'ring_cameras_placement_check', {
    check: "placement IN ('front_door', 'indoor', 'other')",
  });
  pgm.createIndex('ring_cameras', ['family_id', 'ring_device_id'], { unique: true });

  pgm.createTable('ring_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    ring_camera_id: { type: 'uuid', references: 'ring_cameras', onDelete: 'RESTRICT' },
    ring_event_key: { type: 'text', notNull: true, unique: true },
    kind: { type: 'text', notNull: true },
    // Ring's Smart Alert label ('human', 'vehicle', ...) when present.
    sub_type: { type: 'text' },
    source: { type: 'text', notNull: true },
    occurred_at: { type: 'timestamptz', notNull: true },
    received_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    // The event type string exactly as Ring sent it, e.g. 'motion_detected'.
    raw_type: { type: 'text', notNull: true },
  });
  pgm.addConstraint('ring_events', 'ring_events_kind_check', {
    check: "kind IN ('motion', 'ding', 'online', 'offline', 'other')",
  });
  pgm.addConstraint('ring_events', 'ring_events_source_check', {
    check: "source IN ('ring', 'simulator')",
  });
  // The caregiver activity feed, newest first.
  pgm.createIndex('ring_events', ['family_id', 'occurred_at']);

  // Append-only, reusing the shared guard (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER ring_events_append_only
      BEFORE UPDATE OR DELETE ON ring_events
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER ring_events_no_truncate
      BEFORE TRUNCATE ON ring_events
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON ring_events FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('ring_events');
  pgm.dropTable('ring_cameras');
};
