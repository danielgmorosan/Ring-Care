import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` — and everything it awaits — with the given request id in context. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The current request's correlation id, or undefined outside a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
