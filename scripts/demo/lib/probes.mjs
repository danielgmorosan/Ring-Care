// Reachability checks for the local services. Uses the backend's own drivers (pg,
// @temporalio/client), so "reachable" here means reachable the way the backend connects.
import net from 'node:net';
import { backendRequire, sleep } from './common.mjs';

/** True when something accepts TCP connections on host:port. */
export function tcpOpen(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export function hostPort(address, defaultPort) {
  const [host, port] = String(address).split(':');
  return { host: host || 'localhost', port: Number(port || defaultPort) };
}

/** Retry `probe` (resolves truthy when ready) until the deadline. */
export async function waitFor(probe, { timeoutMs = 90_000, everyMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      if (await probe()) return { ok: true };
    } catch (err) {
      last = err;
    }
    await sleep(everyMs);
  }
  return { ok: false, error: last };
}

/** SELECT 1 against DATABASE_URL. Throws the driver error when it fails. */
export async function pgPing(url) {
  const { Client } = backendRequire('pg');
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    await c.query('SELECT 1');
    return true;
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** A gRPC round trip to the Temporal frontend (the dev server's port is open before it serves). */
export async function temporalPing(address) {
  const { Connection } = backendRequire('@temporalio/client');
  const conn = await Connection.connect({ address, connectTimeout: 3000 });
  try {
    await conn.workflowService.getSystemInfo({});
    return true;
  } finally {
    await conn.close().catch(() => undefined);
  }
}
