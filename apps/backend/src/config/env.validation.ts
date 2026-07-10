import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/**
 * Environment contract. Config is validated at boot and the process refuses to
 * start on anything missing or malformed — we never limp along on bad config.
 * Secrets come from the environment / vault, never from files in the repo.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  // Optional: when absent, repositories fall back to in-memory adapters (skeleton
  // mode). When set, Postgres/TimescaleDB-backed repositories are used.
  DATABASE_URL: z.string().min(1).optional(),
  // Optional ephemeral state store (presence, rate limits).
  REDIS_URL: z.string().min(1).optional(),
  // Device link (F0.3). When MQTT_URL is set the backend connects to the broker
  // and ingests device events/heartbeats. Use mqtts:// with mutual-TLS cert paths.
  // MQTT_URL is the backend's own address for the broker (internal, e.g. mqtts://emqx:8883).
  MQTT_URL: z.string().min(1).optional(),
  // The broker address handed to GUARDIAN PHONES at provisioning. Phones are external, so
  // this must be a publicly reachable host (e.g. mqtts://api.yourdomain.com:8883), NOT the
  // internal container name. Falls back to MQTT_URL when unset (fine for local dev where the
  // device and broker share a host).
  DEVICE_MQTT_URL: z.string().min(1).optional(),
  MQTT_CA_PATH: z.string().min(1).optional(),
  MQTT_CERT_PATH: z.string().min(1).optional(),
  MQTT_KEY_PATH: z.string().min(1).optional(),
  // Device-cert issuance (F2.6): the CA that signs per-device client certs at
  // provisioning. The cert path is the CA public cert (also handed to the device to
  // trust the broker); the key path is the CA private key that does the signing —
  // sensitive, from the vault in production. When both are set, provisioning issues
  // the device a mutual-TLS identity; otherwise it binds the device with a token only.
  DEVICE_CA_CERT_PATH: z.string().min(1).optional(),
  DEVICE_CA_KEY_PATH: z.string().min(1).optional(),
  // Seconds without a heartbeat before a device is considered offline.
  DEVICE_OFFLINE_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(90),
  // Seconds after leaving a door zone with no one seen again before a wander alert
  // (F2.3). Default 15 minutes; per-household tuning is a follow-up.
  WANDER_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  // Minutes after a scheduled medication time with no confirmation before the family
  // is told the dose was missed (F3.4). Default 60; per-household tuning is a follow-up.
  MISSED_DOSE_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  // Provisioning (F2.6). How long a device claim code stays valid — short, because
  // a used phone should be paired in one sitting ("<15 min" is the GTM promise).
  CLAIM_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Escalation engine (F1.4). When TEMPORAL_ADDRESS is set the backend runs the
  // escalation worker and starts durable workflows on incidents.
  TEMPORAL_ADDRESS: z.string().min(1).optional(),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('obrigada-escalation'),
  // Synthetic canary (F1.6). Runs a simulated fall through the pipeline on an
  // interval so a broken pipeline pages us before a family finds out.
  CANARY_ENABLED: z.enum(['true', 'false']).default('false'),
  CANARY_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),
  CANARY_FAMILY_ID: z.string().uuid().default('00000000-0000-4000-8000-0000000ca000'),
  CANARY_DEVICE_ID: z.string().uuid().default('00000000-0000-4000-8000-0000000ca001'),
  // Auth. JWT_SECRET must be a real secret from the vault in production; the dev
  // default only exists so local runs work without configuration.
  JWT_SECRET: z.string().min(1).default('dev-only-insecure-secret-change-in-prod'),
  JWT_TTL: z.string().min(1).default('7d'),
  // Incident narration (F3.2). When ANTHROPIC_API_KEY is set the Claude adapter
  // narrates the incident trail (structured text in, text out — never media). When
  // absent, a deterministic local mock is used and nothing leaves the backend.
  // NOTE: enabling the real adapter sends minimized personal data outside the EU;
  // requires a recorded founder decision (rule #6). See docs/decisions/.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5'),
  // Outbound calls/SMS (F1.5). When all three Twilio values are set the real
  // adapter places calls and sends SMS; otherwise the mock dials no one and the
  // escalation ladder still runs end-to-end. Credentials come from the vault.
  // NOTE: enabling Twilio routes family phone numbers and alert text through a new
  // subprocessor; requires a recorded founder decision (rule #6). See docs/decisions/.
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().min(1).optional(),
  // Twilio API host — default is the EU (Ireland) edge for data residency (rule #6).
  TWILIO_API_BASE_URL: z.string().url().default('https://api.twilio.com'),
  // The backend's public https origin (e.g. a tunnel in the demo), no trailing path. Needed
  // for Twilio callbacks: with Twilio configured AND this set, family calls say "Press 1 if
  // you are handling this" and Twilio posts the key press to /twilio/calls/confirm. Unset:
  // calls are one-way and the ladder moves on at once, as before.
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('https://'), 'PUBLIC_BASE_URL must be an https URL')
    .optional(),
  // Signs the call-confirmation callback URLs (HMAC-SHA256) so nobody can forge a press-1.
  // Optional: when unset, a key is derived from JWT_SECRET. From the vault in production.
  CALLBACK_SIGNING_SECRET: z.string().min(16).optional(),
  // Critical-alert push (F1.6). When the full FCM service-account set is present the
  // real adapter sends critical push via FCM (and APNs for iOS, configured in the
  // Firebase project); otherwise the mock notifies no device and the ladder still
  // runs. Credentials come from the vault. NOTE: push transits Google/Apple (non-EU);
  // requires a recorded founder decision (rule #6). See docs/decisions/0004.
  FCM_PROJECT_ID: z.string().min(1).optional(),
  FCM_CLIENT_EMAIL: z.string().min(1).optional(),
  // The service-account private key. Newlines may be escaped as \n in the env.
  FCM_PRIVATE_KEY: z.string().min(1).optional(),
  // Live view + voice assistant (F2.5/F3.6). When all three LiveKit values are set the
  // backend mints scoped room tokens so an authorized family member can open the E2EE
  // live camera (and, later, the voice agent can run); otherwise live view/voice are off
  // and the safety core is entirely unaffected. LiveKit relays media but it is E2EE — the
  // server cannot decrypt it (rule #1's live-channel exception). NOTE: LiveKit is a
  // subprocessor, self-hosted in the EU or LiveKit Cloud in an EU region; requires a
  // recorded founder decision (rule #6). See docs/decisions/0010-live-view-camera.md.
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  // Rate limiting. A default per-IP budget for all routes, with stricter limits on
  // auth and provisioning (set on the routes themselves). Set to 'false' to disable.
  THROTTLE_ENABLED: z.enum(['true', 'false']).default('true'),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  // On shutdown, keep serving (readiness reports down) for this long so a load
  // balancer drains traffic before connections close. Set to the LB's readiness
  // poll interval in production; 0 in dev for instant restarts.
  SHUTDOWN_GRACE_SECONDS: z.coerce.number().int().min(0).default(0),
  // Behind a reverse proxy (Caddy) in production: trust X-Forwarded-* so per-IP
  // rate limiting and request logging see the real client, not the proxy.
  BEHIND_PROXY: z.enum(['true', 'false']).default('false'),
  // Comma-separated allowlist of browser origins for CORS (e.g. the web app's URL).
  // Unset = reflect any origin (fine in dev); set it in production to lock it down.
  CORS_ORIGINS: z.string().optional(),
  // Log output: 'pretty' (human-readable, dev) or 'json' (one JSON object per line
  // carrying the request id, for log aggregation in production).
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  // --- Amazon hackathon integrations (Ring, Bee, Bedrock). All optional; each feature is
  // off unless configured. Each is a new subprocessor: see docs/decisions/0011-0013 (rule #6).
  // Ring Partner API (Amazon Vision). Playground mode uses a short-lived RING_ACCESS_TOKEN;
  // production mode uses the OAuth refresh-token set. RING_HMAC_SECRET verifies webhooks.
  RING_API_BASE_URL: z.string().url().default('https://api.amazonvision.com'),
  RING_OAUTH_BASE_URL: z.string().url().default('https://oauth.ring.com'),
  RING_CLIENT_ID: z.string().min(1).optional(),
  RING_CLIENT_SECRET: z.string().min(1).optional(),
  RING_REFRESH_TOKEN: z.string().min(1).optional(),
  RING_ACCESS_TOKEN: z.string().min(1).optional(),
  RING_HMAC_SECRET: z.string().min(1).optional(),
  // Single-household binding for the hackathon build: which family the linked Ring account
  // belongs to. Multi-family account linking (one-way linking flow) replaces this later.
  RING_FAMILY_ID: z.string().uuid().optional(),
  // Night window for door activity, in the household's local time (HH:MM).
  RING_NIGHT_START: z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
  RING_NIGHT_END: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  // Minutes after an expected visit starts before a no-show is reported to the family.
  VISIT_ARRIVAL_GRACE_MINUTES: z.coerce.number().int().positive().default(20),
  // AI provider for narration, Q&A and care extraction. 'bedrock' keeps inference in an
  // EU AWS region (decision 0013); 'anthropic' uses ANTHROPIC_API_KEY; unset = mock.
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'bedrock']).optional(),
  BEDROCK_REGION: z.string().min(1).default('eu-central-1'),
  // An EU cross-region inference profile id (e.g. an "eu." prefixed model id).
  BEDROCK_MODEL_ID: z.string().min(1).optional(),
  // Bee (caregiver's wearable). Developer API token of the caregiver's Bee account, and a
  // bearer secret the `bee stream --webhook-endpoint` sidecar sends to /bee/webhook.
  BEE_API_BASE_URL: z.string().url().default('https://api.developer.bee.amazon.dev'),
  BEE_API_TOKEN: z.string().min(1).optional(),
  BEE_WEBHOOK_SECRET: z.string().min(16).optional(),
  BEE_FAMILY_ID: z.string().uuid().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config's `validate` hook. Throws a readable error on failure. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Typed, injectable view over validated config. Inject this, not ConfigService. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get host(): string {
    return this.config.get('HOST', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string | undefined {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string | undefined {
    return this.config.get('REDIS_URL', { infer: true });
  }

  /** True when a real database is configured; drives the repository adapter choice. */
  get hasDatabase(): boolean {
    return Boolean(this.databaseUrl);
  }

  get mqttUrl(): string | undefined {
    return this.config.get('MQTT_URL', { infer: true });
  }

  /** The broker address given to guardian phones at provisioning (public). Falls back to
   * the backend's own MQTT_URL when unset. */
  get deviceMqttUrl(): string | undefined {
    return this.config.get('DEVICE_MQTT_URL', { infer: true }) ?? this.mqttUrl;
  }

  get mqttCaPath(): string | undefined {
    return this.config.get('MQTT_CA_PATH', { infer: true });
  }

  get deviceCaCertPath(): string | undefined {
    return this.config.get('DEVICE_CA_CERT_PATH', { infer: true });
  }

  get deviceCaKeyPath(): string | undefined {
    return this.config.get('DEVICE_CA_KEY_PATH', { infer: true });
  }

  /** Whether the CA is configured to issue per-device mutual-TLS certificates. */
  get hasDeviceCa(): boolean {
    return Boolean(this.deviceCaCertPath && this.deviceCaKeyPath);
  }

  get mqttCertPath(): string | undefined {
    return this.config.get('MQTT_CERT_PATH', { infer: true });
  }

  get mqttKeyPath(): string | undefined {
    return this.config.get('MQTT_KEY_PATH', { infer: true });
  }

  /** True when the device link is configured; gates the MQTT ingestion service. */
  get hasMqtt(): boolean {
    return Boolean(this.mqttUrl);
  }

  get deviceOfflineThresholdSeconds(): number {
    return this.config.get('DEVICE_OFFLINE_THRESHOLD_SECONDS', { infer: true });
  }

  get wanderWindowSeconds(): number {
    return this.config.get('WANDER_WINDOW_SECONDS', { infer: true });
  }

  get missedDoseWindowMinutes(): number {
    return this.config.get('MISSED_DOSE_WINDOW_MINUTES', { infer: true });
  }

  get claimCodeTtlSeconds(): number {
    return this.config.get('CLAIM_CODE_TTL_SECONDS', { infer: true });
  }

  get jwtSecret(): string {
    return this.config.get('JWT_SECRET', { infer: true });
  }

  get jwtTtl(): string {
    return this.config.get('JWT_TTL', { infer: true });
  }

  /** Guards against booting production with the insecure default JWT secret. */
  get isJwtSecretInsecureDefault(): boolean {
    return this.jwtSecret === 'dev-only-insecure-secret-change-in-prod';
  }

  get temporalAddress(): string | undefined {
    return this.config.get('TEMPORAL_ADDRESS', { infer: true });
  }

  get temporalNamespace(): string {
    return this.config.get('TEMPORAL_NAMESPACE', { infer: true });
  }

  get temporalTaskQueue(): string {
    return this.config.get('TEMPORAL_TASK_QUEUE', { infer: true });
  }

  /** True when Temporal is configured; gates the escalation worker + client. */
  get hasTemporal(): boolean {
    return Boolean(this.temporalAddress);
  }

  get canaryEnabled(): boolean {
    return this.config.get('CANARY_ENABLED', { infer: true }) === 'true';
  }

  get canaryIntervalSeconds(): number {
    return this.config.get('CANARY_INTERVAL_SECONDS', { infer: true });
  }

  get canaryFamilyId(): string {
    return this.config.get('CANARY_FAMILY_ID', { infer: true });
  }

  get canaryDeviceId(): string {
    return this.config.get('CANARY_DEVICE_ID', { infer: true });
  }

  get anthropicApiKey(): string | undefined {
    return this.config.get('ANTHROPIC_API_KEY', { infer: true });
  }

  get anthropicModel(): string {
    return this.config.get('ANTHROPIC_MODEL', { infer: true });
  }

  /**
   * True when a Claude API key is configured; drives the narration adapter choice.
   * When false, narration uses the deterministic local mock and nothing leaves the
   * backend. Enabling this sends minimized personal data outside the EU — gate it
   * on a recorded founder decision (rule #6).
   */
  get hasNarration(): boolean {
    return Boolean(this.anthropicApiKey);
  }

  get livekitUrl(): string | undefined {
    return this.config.get('LIVEKIT_URL', { infer: true });
  }

  get livekitApiKey(): string | undefined {
    return this.config.get('LIVEKIT_API_KEY', { infer: true });
  }

  get livekitApiSecret(): string | undefined {
    return this.config.get('LIVEKIT_API_SECRET', { infer: true });
  }

  /**
   * True only when the full LiveKit credential set is configured; drives whether live view
   * (and the voice agent) is available. When false, the token endpoint reports the feature
   * off and the safety core is unaffected. Enabling this introduces a media-relay
   * subprocessor — gate it on a recorded founder decision (rule #6). See
   * docs/decisions/0010-live-view-camera.md.
   */
  get hasLiveKit(): boolean {
    return Boolean(this.livekitUrl && this.livekitApiKey && this.livekitApiSecret);
  }

  get twilioAccountSid(): string | undefined {
    return this.config.get('TWILIO_ACCOUNT_SID', { infer: true });
  }

  get twilioAuthToken(): string | undefined {
    return this.config.get('TWILIO_AUTH_TOKEN', { infer: true });
  }

  get twilioFromNumber(): string | undefined {
    return this.config.get('TWILIO_FROM_NUMBER', { infer: true });
  }

  get twilioApiBaseUrl(): string {
    return this.config.get('TWILIO_API_BASE_URL', { infer: true });
  }

  /**
   * True only when the full Twilio credential set is configured; drives the
   * notification adapter choice. When false, the mock dials no one and the
   * escalation ladder still runs. Enabling this routes family phone numbers and
   * alert text through a new subprocessor — gate it on a recorded founder
   * decision (rule #6). See docs/decisions/0003.
   */
  get hasTwilio(): boolean {
    return Boolean(this.twilioAccountSid && this.twilioAuthToken && this.twilioFromNumber);
  }

  /** The backend's public https origin (no trailing slash), or undefined. */
  get publicBaseUrl(): string | undefined {
    return this.config.get('PUBLIC_BASE_URL', { infer: true })?.replace(/\/+$/, '');
  }

  get callbackSigningSecret(): string | undefined {
    return this.config.get('CALLBACK_SIGNING_SECRET', { infer: true });
  }

  /**
   * True when family calls can ask for, and receive, a press-1 confirmation: Twilio is
   * configured and Twilio can reach us back at PUBLIC_BASE_URL.
   */
  get hasCallConfirmation(): boolean {
    return this.hasTwilio && Boolean(this.publicBaseUrl);
  }

  get fcmProjectId(): string | undefined {
    return this.config.get('FCM_PROJECT_ID', { infer: true });
  }

  get fcmClientEmail(): string | undefined {
    return this.config.get('FCM_CLIENT_EMAIL', { infer: true });
  }

  /** The service-account private key, with any escaped \n restored to real newlines. */
  get fcmPrivateKey(): string | undefined {
    return this.config.get('FCM_PRIVATE_KEY', { infer: true })?.replace(/\\n/g, '\n');
  }

  /**
   * True only when the full FCM service-account set is configured; drives the push
   * adapter choice. When false, the mock notifies no device and the escalation ladder
   * still runs. Enabling this routes alert text and device tokens through Google/Apple
   * push — gate it on a recorded founder decision (rule #6). See docs/decisions/0004.
   */
  get hasPush(): boolean {
    return Boolean(this.fcmProjectId && this.fcmClientEmail && this.fcmPrivateKey);
  }

  get throttleEnabled(): boolean {
    return this.config.get('THROTTLE_ENABLED', { infer: true }) !== 'false';
  }

  get throttleTtlSeconds(): number {
    return this.config.get('THROTTLE_TTL_SECONDS', { infer: true });
  }

  get throttleLimit(): number {
    return this.config.get('THROTTLE_LIMIT', { infer: true });
  }

  get shutdownGraceSeconds(): number {
    return this.config.get('SHUTDOWN_GRACE_SECONDS', { infer: true });
  }

  get behindProxy(): boolean {
    return this.config.get('BEHIND_PROXY', { infer: true }) === 'true';
  }

  /** Allowed CORS origins, or undefined to reflect any origin (dev). */
  get corsOrigins(): string[] | undefined {
    const raw = this.config.get('CORS_ORIGINS', { infer: true });
    if (!raw) return undefined;
    const origins = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length > 0 ? origins : undefined;
  }

  // --- Ring (docs/decisions/0011) ---
  get ringApiBaseUrl(): string { return this.config.get('RING_API_BASE_URL', { infer: true }); }
  get ringOauthBaseUrl(): string { return this.config.get('RING_OAUTH_BASE_URL', { infer: true }); }
  get ringClientId(): string | undefined { return this.config.get('RING_CLIENT_ID', { infer: true }); }
  get ringClientSecret(): string | undefined { return this.config.get('RING_CLIENT_SECRET', { infer: true }); }
  get ringRefreshToken(): string | undefined { return this.config.get('RING_REFRESH_TOKEN', { infer: true }); }
  get ringAccessToken(): string | undefined { return this.config.get('RING_ACCESS_TOKEN', { infer: true }); }
  get ringHmacSecret(): string | undefined { return this.config.get('RING_HMAC_SECRET', { infer: true }); }
  get ringFamilyId(): string | undefined { return this.config.get('RING_FAMILY_ID', { infer: true }); }
  get ringNightStart(): string { return this.config.get('RING_NIGHT_START', { infer: true }); }
  get ringNightEnd(): string { return this.config.get('RING_NIGHT_END', { infer: true }); }
  get visitArrivalGraceMinutes(): number { return this.config.get('VISIT_ARRIVAL_GRACE_MINUTES', { infer: true }); }
  /** How the backend talks to Ring: OAuth refresh tokens, a Playground token, or not at all. */
  get ringAuthMode(): 'oauth' | 'playground' | 'off' {
    if (this.ringClientId && this.ringClientSecret && this.ringRefreshToken) return 'oauth';
    if (this.ringAccessToken) return 'playground';
    return 'off';
  }
  /** True when signed Ring webhooks can be accepted (real Ring or the local simulator). */
  get hasRingWebhooks(): boolean { return Boolean(this.ringHmacSecret && this.ringFamilyId); }

  // --- AI provider (docs/decisions/0013) ---
  get bedrockRegion(): string { return this.config.get('BEDROCK_REGION', { infer: true }); }
  get bedrockModelId(): string | undefined { return this.config.get('BEDROCK_MODEL_ID', { infer: true }); }
  /** Which LLM backs narration, Q&A and care extraction. Falls back to the local mock. */
  get aiProvider(): 'mock' | 'anthropic' | 'bedrock' {
    const chosen = this.config.get('AI_PROVIDER', { infer: true });
    if (chosen === 'bedrock') return this.bedrockModelId ? 'bedrock' : 'mock';
    if (chosen === 'anthropic') return this.anthropicApiKey ? 'anthropic' : 'mock';
    if (chosen === 'mock') return 'mock';
    return this.anthropicApiKey ? 'anthropic' : 'mock';
  }

  // --- Bee (docs/decisions/0012) ---
  get beeApiBaseUrl(): string { return this.config.get('BEE_API_BASE_URL', { infer: true }); }
  get beeApiToken(): string | undefined { return this.config.get('BEE_API_TOKEN', { infer: true }); }
  get beeWebhookSecret(): string | undefined { return this.config.get('BEE_WEBHOOK_SECRET', { infer: true }); }
  get beeFamilyId(): string | undefined { return this.config.get('BEE_FAMILY_ID', { infer: true }); }
  get hasBee(): boolean { return Boolean(this.beeWebhookSecret && this.beeFamilyId); }

}
