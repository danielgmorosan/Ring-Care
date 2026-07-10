/**
 * Device provisioning claim codes (F2.6).
 *
 * A caregiver registers a guardian and gets a short, single-use claim code that
 * expires quickly. The phone presents the code once to bind itself to the family
 * (the "drawer phone -> guardian" moment). Only the SHA-256 hash of the code is
 * stored, never the code itself — a database read cannot recover a usable code. Not
 * append-only: this is provisioning state, not the incident audit trail.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('device_claim_codes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'CASCADE' },
    // SHA-256 hex of the claim code. The plaintext code is shown to the caregiver
    // once and never persisted.
    code_hash: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    // Set when the code is redeemed; a code is single-use.
    consumed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Provisioning looks a device up by the presented code's hash.
  pgm.createIndex('device_claim_codes', 'code_hash');
  pgm.createIndex('device_claim_codes', 'device_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('device_claim_codes');
};
