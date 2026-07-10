/**
 * Per-household timezone. "Today" for the daily summary and care view must mean the
 * elder's local day, not UTC. Defaults to UTC for existing rows; new families set it
 * from the caregiver's device at signup.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('families', {
    timezone: { type: 'text', notNull: true, default: 'UTC' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('families', 'timezone');
};
