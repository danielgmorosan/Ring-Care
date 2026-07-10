/**
 * heartbeats: periodic device liveness. High volume, operational (not the audit
 * trail), so unlike event_stream it carries a retention policy — old heartbeats
 * are dropped automatically. Missed heartbeats drive the "guardian offline" alert
 * (logic lands in F0.3). A TimescaleDB hypertable partitioned by time.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('heartbeats', {
    time: { type: 'timestamptz', notNull: true },
    device_id: { type: 'uuid', notNull: true, references: 'devices', onDelete: 'RESTRICT' },
    // Lightweight operational telemetry; no media, no biometrics.
    battery_pct: { type: 'smallint' },
    thermal_c: { type: 'double precision' },
    app_version: { type: 'text' },
  });

  pgm.sql(`SELECT create_hypertable('heartbeats', by_range('time'));`);
  pgm.createIndex('heartbeats', ['device_id', 'time']);

  // Retention: drop heartbeat chunks older than 30 days.
  pgm.sql(`SELECT add_retention_policy('heartbeats', INTERVAL '30 days');`);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`SELECT remove_retention_policy('heartbeats', if_exists => true);`);
  pgm.dropTable('heartbeats');
};
