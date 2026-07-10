/**
 * Expected visits (F2.4) — visits the family pre-logs so the guardian knows an
 * unknown person was expected.
 *
 * The trusted-context side of rule #5 ("uniforms are context, never trust"): a
 * stranger is only "expected" when a visit here covers the moment, or the system
 * itself started an emergency. Editable configuration, not the append-only safety
 * trail: normal CRUD, no append-only trigger.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('expected_visits', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // A plain label, e.g. "Nurse", "Plumber". Not a household member.
    visitor_label: { type: 'text', notNull: true },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // The evaluator looks up "any visit for this family covering time T".
  pgm.createIndex('expected_visits', ['family_id', 'starts_at', 'ends_at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('expected_visits');
};
