/**
 * The append-only guarantee (CONTRIBUTING.md rule #2), enforced at the database level.
 *
 * `raise_append_only()` is a trigger function that aborts any UPDATE, DELETE, or
 * TRUNCATE. It fires for every role including the table owner and superusers — a
 * trigger that RAISEs cannot be bypassed by privilege. Tables opt in by attaching
 * row-level (UPDATE/DELETE) and statement-level (TRUNCATE) triggers; see the
 * event_stream migration. Reused by `incidents` when escalation (F1.4) lands.
 *
 * Note: TimescaleDB retention (drop_chunks) is chunk-level DDL, not a row DELETE,
 * so it does not trip this guard — history stays immutable while retention still
 * works on tables that opt into it.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION raise_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Table % is append-only; % is not permitted (CONTRIBUTING.md rule #2)',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS raise_append_only();');
};
