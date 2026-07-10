/**
 * Devices: one guardian phone bound to a family. No biometric or media data ever
 * lives here (rules #1, #4). Per-device TLS identity arrives in F0.3.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createType('device_status', ['registered', 'provisioning', 'online', 'offline']);

  pgm.createTable('devices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    family_id: {
      type: 'uuid',
      notNull: true,
      references: 'families',
      onDelete: 'RESTRICT',
    },
    name: { type: 'text', notNull: true },
    status: { type: 'device_status', notNull: true, default: 'registered' },
    registered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('devices', 'family_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('devices');
  pgm.dropType('device_status');
};
