/**
 * Per-household elder-facing voice check-in language. A safety setting: the guardian's
 * "Are you okay?" check-in must be in the elder's language, not the caregiver's. Defaults
 * to English (which ships first) for existing rows; PT-PT is the fast-follow.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('families', {
    checkin_language: { type: 'text', notNull: true, default: 'en' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('families', 'checkin_language');
};
