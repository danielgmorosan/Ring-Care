import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Incident, IncidentStepView } from '../incident.repository';
import { MockNarrationAdapter } from './mock-narration.adapter';
import {
  NARRATION_PORT,
  type DailySummaryRequest,
  type Narration,
  type NarrationPort,
  type NarrationRequest,
  type NarrationStep,
  type QuestionRequest,
} from './narration.port';
import { NARRATIVE_REPOSITORY, type NarrativeRepository } from './narrative.repository';

/** Voice check-in results that are safe to forward — an allowlist, never raw detail. */
const SAFE_CHECKIN_RESULTS = new Set(['i_am_fine', 'distress', 'silence']);

/**
 * Turns the incident trail into a family-facing narrative (F3.2). Reads only the
 * structured steps, strips them to roles/labels/times/outcome (no names, no media),
 * narrates via the configured port, and persists the result to the append-only
 * narrative store so the words a family read are recorded and not re-billed on every
 * open. If the configured adapter fails, it falls back to the local mock so the
 * family always gets words.
 */
@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name);

  constructor(
    @Inject(NARRATION_PORT) private readonly narrator: NarrationPort,
    @Inject(NARRATIVE_REPOSITORY) private readonly narratives: NarrativeRepository,
    private readonly fallback: MockNarrationAdapter,
  ) {}

  /**
   * The narrative text for an incident. Terminal incidents reuse a stored narrative
   * (and store the first one generated); active incidents narrate fresh each time
   * (their step list is still growing) and are not persisted.
   */
  async narrativeFor(
    incident: Incident,
    steps: IncidentStepView[],
    outcome: string,
  ): Promise<string> {
    const terminal = outcome !== 'active';

    if (terminal) {
      const existing = await this.narratives.getLatest(incident.id);
      if (existing) return existing.text;
    }

    const narration = await this.generate(toRequest(incident, steps, outcome));

    if (terminal) {
      await this.narratives.append({
        incidentId: incident.id,
        text: narration.text,
        generatedBy: narration.generatedBy,
        model: narration.model,
      });
    }
    return narration.text;
  }

  /** The calm daily recap. Generated on demand; not persisted (a day is still live). */
  async summarizeDay(request: DailySummaryRequest): Promise<string> {
    const narration = await this.runWithFallback((port) => port.summarizeDay(request));
    return narration.text;
  }

  /** Answer a caregiver question from the structured context (F3.3). Ephemeral. */
  async answer(request: QuestionRequest): Promise<string> {
    const narration = await this.runWithFallback((port) => port.answer(request));
    return narration.text;
  }

  /** Narrate via the configured adapter; fall back to the local mock on any error. */
  private generate(request: NarrationRequest): Promise<Narration> {
    return this.runWithFallback((port) => port.narrate(request));
  }

  /** Run against the configured adapter; on any failure, retry against the local mock. */
  private async runWithFallback(
    call: (port: NarrationPort) => Promise<Narration>,
  ): Promise<Narration> {
    try {
      return await call(this.narrator);
    } catch (err) {
      this.logger.warn(`Narration adapter failed, using local mock: ${(err as Error).message}`);
      return call(this.fallback);
    }
  }
}

/** Strip steps to the privacy-safe shape the port expects (roles, labels, times). */
function toRequest(
  incident: Incident,
  steps: IncidentStepView[],
  outcome: string,
): NarrationRequest {
  const narrationSteps: NarrationStep[] = steps.map((s) => ({
    kind: s.kind,
    contactRole: s.contactRole,
    note: safeNote(s),
    at: s.occurredAt,
  }));
  return {
    reason: incident.reason,
    openedAt: incident.openedAt,
    outcome,
    steps: narrationSteps,
  };
}

/** Extract only allowlisted, non-identifying fields from a step's detail. */
function safeNote(step: IncidentStepView): string | null {
  if (step.kind === 'voice_checkin_result') {
    const result = step.detail['result'];
    if (typeof result === 'string' && SAFE_CHECKIN_RESULTS.has(result)) return result;
  }
  return null;
}
