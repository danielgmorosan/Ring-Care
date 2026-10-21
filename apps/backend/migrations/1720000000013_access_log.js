/**
 * Access log (CONTRIBUTING.md rule #7: every access is logged).
 *
 * An append-only record of every change a caregiver makes to their family's data —
 * the audit trail families, hospitals, and regulators can read, and the source of the
 * caregiver-facing activity history. Append-only at the database level (rule #2): a
 * log you can rewrite is not an audit trail.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('access_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'RESTRICT' },
    // The acting user; null if the family is later removed.
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    // Semantic action, e.g. 'medication.create'.
    action: { type: 'text', notNull: true },
    method: { type: 'text', notNull: true },
    // Matched route pattern, e.g. '/me/medications/:medicationId'.
    route: { type: 'text', notNull: true },
    at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('access_log', ['family_id', 'at']);

  pgm.sql(`
    CREATE TRIGGER access_log_append_only
      BEFORE UPDATE OR DELETE ON access_log
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();
    CREATE TRIGGER access_log_no_truncate
      BEFORE TRUNCATE ON access_log
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql(`REVOKE UPDATE, DELETE, TRUNCATE ON access_log FROM PUBLIC;`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('access_log');
};
