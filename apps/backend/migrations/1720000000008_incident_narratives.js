/**
 * Incident narration (F3.2).
 *
 * incident_narratives stores the human-words summary a family read for an incident.
 * It is append-only (rule #2): the exact text shown to a family, and which engine
 * produced it, is part of the audit trail. A regenerated or corrected narrative is a
 * NEW row; the latest by created_at wins. generated_by records the source
 * ('mock' | 'claude') and model records the Claude model id when applicable.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('incident_narratives', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    incident_id: { type: 'uuid', notNull: true, references: 'incidents', onDelete: 'RESTRICT' },
    text: { type: 'text', notNull: true },
    // Which adapter produced the text: 'mock' (local, deterministic) or 'claude'.
    generated_by: { type: 'text', notNull: true },
    // The Claude model id when generated_by = 'claude'; null for the mock.
    model: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Latest narrative per incident is fetched by (incident_id, created_at DESC).
  pgm.createIndex('incident_narratives', ['incident_id', 'created_at']);

  pgm.sql(`
    CREATE TRIGGER incident_narratives_append_only
      BEFORE UPDATE OR DELETE ON incident_narratives
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();
    CREATE TRIGGER incident_narratives_no_truncate
      BEFORE TRUNCATE ON incident_narratives
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql(`REVOKE UPDATE, DELETE, TRUNCATE ON incident_narratives FROM PUBLIC;`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('incident_narratives');
};
