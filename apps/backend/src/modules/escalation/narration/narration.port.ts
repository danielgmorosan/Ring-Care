/**
 * Incident narration port (F3.2). Turns the structured incident trail into a short,
 * warm, human-words summary for the family. The real adapter is the Claude API; dev
 * and CI use a deterministic local mock.
 *
 * Privacy contract (rules #1 and #6): the request that reaches an adapter carries
 * ONLY labels, roles, timestamps, and outcome — never names, never pixels, never
 * audio. Nothing here is identifying, so the same shape is safe for the mock (local)
 * and, once a founder decision is recorded, the Claude adapter (leaves the EU).
 */

/** One ladder step, stripped of anything identifying. Role, not name. */
export interface NarrationStep {
  kind: string;
  /** The contact's role ("daughter", "neighbour"), never their name. Null if none. */
  contactRole: string | null;
  /**
   * A short, non-identifying note the service extracted from a known-safe field —
   * currently only the voice check-in result ("i_am_fine" | "distress" | "silence").
   * The service fills this from an allowlist; raw step detail never reaches here.
   */
  note: string | null;
  /** ISO timestamp, or null when the source step carries no time. */
  at: string | null;
}

export interface NarrationRequest {
  /** Why the incident opened, e.g. "fall.suspected". A label, not free text. */
  reason: string;
  openedAt: string;
  /** Derived outcome: 'active' | 'stood_down' | 'acknowledged' | 'emergency_notified'. */
  outcome: string;
  steps: NarrationStep[];
}

export interface Narration {
  text: string;
  /** Which adapter produced this — recorded in the audit trail. */
  generatedBy: 'mock' | 'claude' | 'bedrock';
  /** The model id (Claude model or Bedrock inference profile); null for the mock. */
  model: string | null;
}

/** One incident on a given day, stripped to non-identifying facts. */
export interface DaySummaryIncident {
  reason: string;
  outcome: string;
  at: string;
  /** Household-local clock time of `at` ("3:04"), so the model never converts time zones. */
  localTime?: string;
  /** Plain-language meaning of `reason` (see incident-meanings.ts). */
  meaning?: string;
  /** Plain-language meaning of `outcome`. */
  outcomeMeaning?: string;
}

/**
 * A day's worth of structured facts for the calm "Today" recap. Carries only counts,
 * labels, and outcomes — no names, no media. Same privacy contract as NarrationRequest.
 */
export interface DailySummaryRequest {
  /** The day being summarized, YYYY-MM-DD. */
  date: string;
  incidents: DaySummaryIncident[];
  guardiansTotal: number;
  guardiansOnline: number;
  /**
   * The day's expected visits as counts only (never the visitor's label, which can be a
   * name). Optional: absent means no visit information, and adapters may ignore it.
   */
  visits?: DaySummaryVisits;
}

/** Expected visits for the day: how many were due, arrived, and missed (no arrival). */
export interface DaySummaryVisits {
  expected: number;
  arrived: number;
  missed: number;
}

/**
 * The family's structured record, minimized for the Q&A agent (F3.3). Carries labels,
 * counts, outcomes, and the caregiver's own care records — never elder biometrics,
 * pixels, or audio, and never contact names (roles only, per rule #1).
 */
export interface FamilyContext {
  timezone: string;
  incidents: DaySummaryIncident[];
  guardians: { total: number; online: number };
  medications: { name: string; times: string[] }[];
  appointments: { title: string; at: string }[];
}

export interface QuestionRequest {
  question: string;
  context: FamilyContext;
}

export interface NarrationPort {
  narrate(request: NarrationRequest): Promise<Narration>;
  summarizeDay(request: DailySummaryRequest): Promise<Narration>;
  /** Answer a caregiver's question grounded only in the structured context. */
  answer(request: QuestionRequest): Promise<Narration>;
}

export const NARRATION_PORT = Symbol('NARRATION_PORT');
