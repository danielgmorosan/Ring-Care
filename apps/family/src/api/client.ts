import { z } from 'zod';

/**
 * Base URL for the Obrigada backend. Override with EXPO_PUBLIC_API_URL; defaults
 * to localhost for `expo start --web` against a locally running backend.
 *
 * On a PHYSICAL device (Expo Go on an iPhone/Android), "localhost" is the phone,
 * not your computer — set EXPO_PUBLIC_API_URL to your machine's LAN address, e.g.
 * EXPO_PUBLIC_API_URL=http://192.168.1.183:3000. Requests carry the bearer token
 * from the auth layer; a production build needs HTTPS (iOS App Transport Security).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The bearer token attached to authenticated requests. Set by the auth layer. */
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Called when an authenticated request is rejected (expired/invalid token). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** zod schema to validate and type the JSON response. Omit for 204/no-body. */
  schema?: z.ZodType<T, z.ZodTypeDef, unknown>;
}

export async function api<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema } = options;
  const hadToken = authToken !== null;
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // A 401 on a request we sent with a token means the session is no longer
    // valid — trigger logout. (A 401 on login/signup, sent without a token, does
    // not.)
    if (res.status === 401 && hadToken) onUnauthorized?.();
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { message?: string | string[] };
      if (json?.message)
        detail = Array.isArray(json.message) ? json.message.join(', ') : json.message;
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, detail);
  }

  if (!schema || res.status === 204) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}
