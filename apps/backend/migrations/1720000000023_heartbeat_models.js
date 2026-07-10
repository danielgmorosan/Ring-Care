/**
 * heartbeats.models (F2.6) — the on-device model versions a guardian reports.
 *
 * Adds a jsonb column of model name → version (e.g. {"pose":"movenet-1.2"}) so the
 * fleet view can show which models each guardian runs — the OTA and evaluation story.
 * Labels only, never a model file (rule #1). Nullable: older guardians simply omit it.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('heartbeats', { models: { type: 'jsonb' } });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('heartbeats', 'models');
};
