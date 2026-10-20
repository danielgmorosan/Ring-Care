/**
 * care_proposals + care_proposal_decisions (decision 0012) — the append-only trail of
 * care-plan changes proposed from the caregiver's own Bee voice notes, and of the
 * caregiver's decisions on them.
 *
 * An LLM (or the rule-based fallback) only ever writes a proposal. Nothing reaches the
 * care plan until a human approves it, and both the proposal and the decision are kept
 * immutably (rule #2, rule #7). A proposal's status is derived from its decision row:
 * none = pending, otherwise the recorded decision.
 *
 * Privacy (rule #1): no audio, and not the full transcript. Only the short summary and
 * the structured items derived from the caregiver's own words are stored.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('care_proposals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // Where the proposal came from. Only 'bee' today.
    source: { type: 'text', notNull: true, check: "source IN ('bee')" },
    // The Bee conversation id; the idempotency key within a family.
    source_ref: { type: 'text', notNull: true },
    summary: { type: 'text', notNull: true },
    // ProposalItem[]: { id, kind, title, detail, data }.
    items: { type: 'jsonb', notNull: true },
    // 'bedrock:<model>' | 'anthropic:<model>' | 'rules:v1'.
    extracted_by: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('care_proposals', ['family_id', 'source', 'source_ref'], { unique: true });
  pgm.createIndex('care_proposals', ['family_id', 'created_at']);

  pgm.createTable('care_proposal_decisions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    proposal_id: {
      type: 'uuid',
      notNull: true,
      references: 'care_proposals',
      onDelete: 'CASCADE',
    },
    decision: { type: 'text', notNull: true, check: "decision IN ('approved', 'rejected')" },
    // The item ids the caregiver approved (empty for a rejection).
    item_ids: { type: 'jsonb', notNull: true, default: '[]' },
    // The caregiver's user id.
    decided_by: { type: 'uuid' },
    decided_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    // Per-item outcome: what was applied to the care module and which Bee todos exist.
    result: { type: 'jsonb', notNull: true, default: '{}' },
  });
  // One decision per proposal: a second approve/reject is answered from this row.
  pgm.createIndex('care_proposal_decisions', 'proposal_id', { unique: true });

  // Append-only: block UPDATE/DELETE (row level) and TRUNCATE (statement level),
  // reusing the shared guard function (migration 1720000000003), like sighting_decisions.
  pgm.sql(`
    CREATE TRIGGER care_proposals_append_only
      BEFORE UPDATE OR DELETE ON care_proposals
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER care_proposals_no_truncate
      BEFORE TRUNCATE ON care_proposals
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER care_proposal_decisions_append_only
      BEFORE UPDATE OR DELETE ON care_proposal_decisions
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

    CREATE TRIGGER care_proposal_decisions_no_truncate
      BEFORE TRUNCATE ON care_proposal_decisions
      FOR EACH STATEMENT EXECUTE FUNCTION raise_append_only();
  `);
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON care_proposals FROM PUBLIC;');
  pgm.sql('REVOKE UPDATE, DELETE, TRUNCATE ON care_proposal_decisions FROM PUBLIC;');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('care_proposal_decisions');
  pgm.dropTable('care_proposals');
};
