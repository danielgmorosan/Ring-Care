/**
 * Users: the caregiver accounts. First pass is one user per family (the owner);
 * multi-caregiver invites come later. Passwords are bcrypt hashes — never stored
 * or logged in plaintext. Email is case-insensitive (citext).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createExtension('citext', { ifNotExists: true });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'citext', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    // One owner per family for now (1:1). Relaxed when invites land.
    family_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'families',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('users');
};
