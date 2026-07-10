/**
 * Required Postgres extensions.
 * - timescaledb: hypertables + retention for the high-volume heartbeat/event streams.
 * - pgcrypto: gen_random_uuid() for server-side ids.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createExtension('timescaledb', { ifNotExists: true });
  pgm.createExtension('pgcrypto', { ifNotExists: true });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Leave extensions in place on down-migration; dropping timescaledb is destructive
  // and never something a routine rollback should do.
  pgm.dropExtension('pgcrypto', { ifExists: true });
};
