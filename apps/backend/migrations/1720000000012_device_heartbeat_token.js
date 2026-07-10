/**
 * Per-device check-in token (F2.6 hardening).
 *
 * A guardian is issued a long-lived secret at provisioning and presents it on every
 * heartbeat. Only the SHA-256 hash is stored here, so a database read cannot
 * impersonate a guardian. The device id is not a credential — this hash gates the
 * (otherwise public) telemetry endpoint so a guardian's presence cannot be spoofed.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('devices', {
    heartbeat_token_hash: { type: 'text' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('devices', 'heartbeat_token_hash');
};
