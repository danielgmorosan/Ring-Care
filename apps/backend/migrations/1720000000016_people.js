/**
 * People (F2.2) — the household roster of enrolled members and their roles.
 *
 * Editable configuration, not the append-only safety trail. The backend holds ONLY
 * the roster (a household title and a behaviour role); face embeddings and enrollment
 * photos never reach the cloud — they live in the phone's keystore (CLAUDE.md rule #4).
 *
 * Removal is a soft deactivate (active=false), never a delete, so historical
 * `person.known` events still resolve to a role for narration. This table is normal
 * CRUD: no append-only trigger.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('people', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // A household title, never a legal name: "Grandfather", "Nurse", "Family member 1".
    title: { type: 'text', notNull: true },
    // Behaviour role: resident | family | caregiver | friend | other.
    role: { type: 'text', notNull: true },
    notes: { type: 'text' },
    // False once deactivated; deactivated people are hidden but never deleted.
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // The roster is read per family, filtered to the active people.
  pgm.createIndex('people', ['family_id', 'active']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('people');
};
