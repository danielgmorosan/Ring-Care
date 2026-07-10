/**
 * wander_watches (F2.3) — the return watches opened when someone leaves through a door.
 *
 * Operational state, not the append-only trail: status moves watching → returned |
 * alerted. It lives here (not Redis) so a watch survives a crash mid-wait — the sweep
 * re-reads it on restart and still fires an overdue alert (the deterministic-safety-core
 * rule: nothing time-based is lost to a restart).
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('wander_watches', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    door_zone_id: { type: 'uuid', notNull: true },
    door_name: { type: 'text', notNull: true },
    started_at: { type: 'timestamptz', notNull: true },
    due_at: { type: 'timestamptz', notNull: true },
    // 'watching' | 'returned' | 'alerted'.
    status: { type: 'text', notNull: true, default: 'watching' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // At most one active watch per device — a fresh exit refreshes it (ON CONFLICT).
  pgm.sql(`
    CREATE UNIQUE INDEX wander_watches_active_device_uidx
      ON wander_watches (device_id) WHERE status = 'watching';
  `);
  // The sweep scans for watches whose window has closed.
  pgm.createIndex('wander_watches', ['status', 'due_at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('wander_watches');
};
