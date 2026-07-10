/**
 * Medications (F3.4) — the elder's care schedule, managed by the caregiver.
 *
 * Editable configuration (not the append-only safety trail): families add, remove,
 * and adjust as care changes. No medical data beyond what the family typed; the
 * system derives no advice from it.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('medications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    dosage: { type: 'text' },
    // Times of day to take it, e.g. ["08:00","20:00"].
    times: { type: 'jsonb', notNull: true, default: '[]' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('medications', 'family_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('medications');
};
