/**
 * The protected person's display name and relationship word, so the family app can say
 * "Maria's home" instead of a hard-coded "Mom's home". Both optional (null for existing
 * rows; the app falls back to "Your family member"). Identifying data: exported under
 * GDPR Art. 15/20, blanked on erasure, and never sent to an AI provider (roles only).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('families', {
    elder_name: { type: 'text' },
    elder_relation: {
      type: 'text',
      check: "elder_relation IN ('mother', 'father', 'grandmother', 'grandfather', 'other')",
    },
  });
  pgm.addConstraint('families', 'families_elder_name_length', {
    check: 'elder_name IS NULL OR char_length(elder_name) BETWEEN 1 AND 60',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('families', 'families_elder_name_length');
  pgm.dropColumn('families', ['elder_name', 'elder_relation']);
};
