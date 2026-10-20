import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../../config/env.validation';
import { RingApiError } from './ring-client.port';

/** Supplies the bearer token for Ring calls; `invalidate()` forces a refresh after a 401. */
export interface RingTokenProvider {
  getAccessToken(): Promise<string>;
  /** Returns true when a fresh token can be obtained (so a 401 retry is worth trying). */
  invalidate(): boolean;
}

/** Playground mode: Ring's short-lived developer token, used as-is. Cannot refresh. */
export class StaticRingTokenProvider implements RingTokenProvider {
  constructor(private readonly token: string) {}

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  invalidate(): boolean {
    return false;
  }
}

/** Ring access tokens live about 4 hours; refresh a little early. */
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;
const EARLY_REFRESH_MS = 5 * 60 * 1000;

/**
 * OAuth mode: exchanges the refresh token at `{RING_OAUTH_BASE_URL}/oauth/token` and
 * caches the access token. Ring rotates the refresh token on every exchange; we keep the
 * rotated one in memory only. In production it must be persisted (vault/secret store),
 * or a restart falls back to the original env token, which Ring may already have revoked.
 */
export class OAuthRingTokenProvider implements RingTokenProvider {
  private readonly logger = new Logger(OAuthRingTokenProvider.name);
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshToken: string;
  private inflight: Promise<string> | null = null;
  private warnedRotation = false;

  constructor(
    private readonly config: Pick<
      AppConfig,
      'ringOauthBaseUrl' | 'ringClientId' | 'ringClientSecret' | 'ringRefreshToken'
    >,
    private readonly now: () => number = Date.now,
  ) {
    this.refreshToken = config.ringRefreshToken ?? '';
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.now() < this.expiresAt - EARLY_REFRESH_MS) {
      return this.accessToken;
    }
    // Collapse concurrent refreshes into one exchange (a rotated refresh token is single use).
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  invalidate(): boolean {
    this.accessToken = null;
    this.expiresAt = 0;
    return true;
  }

  private async refresh(): Promise<string> {
    const url = `${this.config.ringOauthBaseUrl.replace(/\/$/, '')}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.config.ringClientId ?? '',
      client_secret: this.config.ringClientSecret ?? '',
    });
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new RingApiError(`Ring token refresh failed: ${(err as Error).message}`, 0);
    }
    if (!res.ok) {
      // Never log the response body: it may echo credentials.
      throw new RingApiError(`Ring token refresh failed (${res.status})`, res.status);
    }
    const json = (await res.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof json.access_token !== 'string' || json.access_token === '') {
      throw new RingApiError('Ring token refresh returned no access_token', res.status);
    }
    if (typeof json.refresh_token === 'string' && json.refresh_token !== this.refreshToken) {
      this.refreshToken = json.refresh_token;
      if (!this.warnedRotation) {
        this.warnedRotation = true;
        this.logger.warn(
          'Ring rotated the refresh token; it is kept in memory only. Persist rotation in production or a restart will lose the link.',
        );
      }
    }
    const ttl =
      typeof json.expires_in === 'number' && json.expires_in > 0
        ? json.expires_in
        : DEFAULT_TTL_SECONDS;
    this.accessToken = json.access_token;
    this.expiresAt = this.now() + ttl * 1000;
    return this.accessToken;
  }
}
