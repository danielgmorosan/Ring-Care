import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventsService, type SecondOpinion } from '../events/events.service';
import { FamiliesService } from '../families/families.service';
import { incidentReasonLabel } from './incident-labels';
import {
  INCIDENT_REPOSITORY,
  type IncidentRepository,
  type IncidentStepView,
} from './incident.repository';
import { NarrationService } from './narration/narration.service';

/** How an incident resolved, derived from its ladder steps. */
export type IncidentOutcome =
  | 'active'
  | 'stood_down'
  | 'acknowledged'
  | 'emergency_notified'
  // A family-only ladder (door.night_activity, 0011) reached everyone; no 112 step exists.
  | 'family_alerted';

export interface IncidentSummary {
  id: string;
  reason: string;
  /** A short human label for the reason ("Front door at night"), for the Timeline. */
  label: string;
  openedAt: string;
  outcome: IncidentOutcome;
  stepCount: number;
}

export interface IncidentDetail {
  id: string;
  reason: string;
  /** A short human label for the reason, for the incident header. */
  label: string;
  openedAt: string;
  outcome: IncidentOutcome;
  /** Warm, human-words summary of the incident (F3.2). */
  narrative: string;
  steps: IncidentStepView[];
  /**
   * The on-device VLM's second opinion on the flag that opened this incident (F3.1),
   * or null if it did not run. Shown alongside the trail as one input among the rules;
   * it never decided anything (rule #3).
   */
  secondOpinion: SecondOpinion | null;
}

/** Derive the outcome from the set of step kinds an incident recorded. */
function outcomeFromKinds(kinds: string[]): IncidentOutcome {
  if (kinds.includes('stood_down')) return 'stood_down';
  if (kinds.includes('call_answered')) return 'acknowledged';
  if (kinds.includes('emergency_notified')) return 'emergency_notified';
  if (kinds.includes('family_alerted')) return 'family_alerted';
  return 'active';
}

/**
 * The family-facing read side of the incident trail (Timeline). Read-only and
 * always scoped to the caller's family — an incident belonging to another family
 * is a 404, never a leak. Never writes; the append-only trail is untouched.
 */
@Injectable()
export class IncidentsQueryService {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
    private readonly families: FamiliesService,
    private readonly narration: NarrationService,
    private readonly events: EventsService,
  ) {}

  async listForFamily(familyId: string): Promise<IncidentSummary[]> {
    await this.families.findByIdOrFail(familyId);
    const rows = await this.incidents.listByFamily(familyId);
    // N+1 over step reads — fine while incident counts per family are small;
    // fold into a single query if this ever gets hot.
    return Promise.all(
      rows.map(async (incident) => {
        const kinds = await this.incidents.listStepKinds(incident.id);
        return {
          id: incident.id,
          reason: incident.reason,
          label: incidentReasonLabel(incident.reason),
          openedAt: incident.openedAt,
          outcome: outcomeFromKinds(kinds),
          stepCount: kinds.length,
        };
      }),
    );
  }

  async detailForFamily(familyId: string, incidentId: string): Promise<IncidentDetail> {
    await this.families.findByIdOrFail(familyId);
    const incident = await this.incidents.findById(incidentId);
    if (!incident || incident.familyId !== familyId) {
      throw new NotFoundException(`Incident ${incidentId} not found in family ${familyId}`);
    }
    const steps = await this.incidents.listSteps(incidentId);
    const outcome = outcomeFromKinds(steps.map((s) => s.kind));
    const narrative = await this.narration.narrativeFor(incident, steps, outcome);
    return {
      id: incident.id,
      reason: incident.reason,
      label: incidentReasonLabel(incident.reason),
      openedAt: incident.openedAt,
      outcome,
      narrative,
      steps,
      secondOpinion: await this.secondOpinionFor(incident.deviceId, incident.triggeringEventId),
    };
  }

  /** The latest VLM verdict about the flag that opened the incident, if any. */
  private async secondOpinionFor(
    deviceId: string | null,
    triggeringEventId: string | null,
  ): Promise<SecondOpinion | null> {
    // A family-level incident (a Ring camera) has no guardian, so no VLM second opinion.
    if (!deviceId || !triggeringEventId) return null;
    const opinions = await this.events.secondOpinionsFor(deviceId, triggeringEventId);
    return opinions[0] ?? null;
  }
}
