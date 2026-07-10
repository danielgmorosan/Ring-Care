/**
 * Device push tokens (F1.6).
 *
 * When a caregiver opens the family app on a phone, the app requests notification
 * permission and receives a push token (an opaque address for that device's FCM/APNs
 * registration). It registers the token here so the escalation ladder can send a
 * critical alert to that phone. Not append-only: tokens rotate and are removed on
 * sign-out — this is delivery routing, not the incident audit trail. The token is an
 * opaque device identifier, never a person's data (rule #1).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('push_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    // The opaque FCM/APNs device token.
    token: { type: 'text', notNull: true },
    // 'ios' | 'android' | 'web' — informs the send payload.
    platform: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // A device token is unique; re-registering the same device upserts on it.
  pgm.addConstraint('push_tokens', 'push_tokens_token_unique', { unique: ['token'] });
  // Escalation looks up all of a family's devices to alert them.
  pgm.createIndex('push_tokens', 'family_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('push_tokens');
};
