/** DI token for the shared pg Pool. Injected only by Postgres-backed repositories. */
export const PG_POOL = Symbol('PG_POOL');

/** DI token for the shared Redis client (ephemeral state only). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
