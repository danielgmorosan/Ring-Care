/**
 * dose_confirmations (F3.4) — the elder's medication dose confirmations.
 *
 * The guardian speaks the reminder, the elder confirms by voice, the device reports it
 * here. Append-only adherence record (rules #2, #7) that the family sees and the
 * missed-dose alert will read. Labels and times only, never audio (rule #1).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('dose_confirmations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // Client-generated id so a replayed confirmation records once.
    dose_id: { type: 'uuid', notNull: true },
    medication_id: {
      type: 'uuid',
      notNull: true,
      references: 'medications',
      onDelete: 'CASCADE',
    },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // Which scheduled dose, as the "HH:MM" slot; null if ad-hoc.
    slot: { type: 'text' },
    confirmed_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // One record per confirmation (idempotent replay).
  pgm.createIndex('dose_confirmations', 'dose_id', { unique: true });
  // The family read side, newest first.
  pgm.createIndex('dose_confirmations', ['family_id', 'medication_id', 'confirmed_at']);

  // Append-only: block UPDATE/DELETE (row) and TRUNCATE (statement), reusing the shared
  // guard function (migration 1720000000003).
  pgm.sql(`
    CREATE TRIGGER dose_confirmations_append_only
      BEFORE UPDATE OR DELETE ON dose_confirmations
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER dose_confirmations_no_truncate
      BEFORE TRUNCATE ON dose_confirmations
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON dose_confirmations FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('dose_confirmations');
};
