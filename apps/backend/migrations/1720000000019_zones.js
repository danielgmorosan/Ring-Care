/**
 * Zones (F2.3) — the red zones and doorways a family draws on their guardians.
 *
 * The device runs the geometry on-device (pose keypoints inside a polygon, built on
 * F1.2); the backend only stores the definition and syncs it down. Coordinates, never
 * pixels (rule #1). Editable configuration, not the append-only safety trail: normal
 * CRUD with a soft-delete flag, no append-only trigger. Removal is a deactivate so
 * historical zone.entry/zone.exit events still resolve to a zone.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('zones', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    // 'hazard' (alert on entry) | 'door' (wandering logic on exit).
    kind: { type: 'text', notNull: true },
    // Polygon vertices normalized to [0,1] in the device frame, e.g. [{"x":0.1,"y":0.2}].
    points: { type: 'jsonb', notNull: true },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // The app lists a family's zones; the device and evaluator read one device's zones.
  pgm.createIndex('zones', ['family_id', 'active']);
  pgm.createIndex('zones', ['device_id', 'active']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('zones');
};
