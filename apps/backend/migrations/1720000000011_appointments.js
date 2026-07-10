/**
 * Appointments (F3.4) — the elder's calendar, managed by the caregiver.
 *
 * Editable configuration (not the append-only safety trail).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('appointments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    at: { type: 'timestamptz', notNull: true },
    location: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Listed by family, soonest first.
  pgm.createIndex('appointments', ['family_id', 'at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('appointments');
};
