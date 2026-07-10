/**
 * alerts.device_id becomes nullable (F3.4). Most alerts come from a guardian, but a
 * missed-dose alert is family-level — there is no single device behind it. Widening the
 * column lets the one alerts trail hold those too. Append-only is unchanged.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.alterColumn('alerts', 'device_id', { notNull: false });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.alterColumn('alerts', 'device_id', { notNull: true });
};
