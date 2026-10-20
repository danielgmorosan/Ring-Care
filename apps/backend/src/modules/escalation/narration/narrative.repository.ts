/**
 * Append-only store for incident narratives (F3.2). A regenerated narrative is a new
 * record; getLatest returns the most recent for an incident. The audit trail keeps
 * every text a family was ever shown (rule #2).
 */

export interface NarrativeRecord {
  incidentId: string;
  text: string;
  generatedBy: 'mock' | 'claude' | 'bedrock';
  model: string | null;
  createdAt: string;
}

export interface NarrativeRepository {
  /** The most recent narrative for an incident, or null if none exists yet. */
  getLatest(incidentId: string): Promise<NarrativeRecord | null>;
  /** Append a new narrative record. */
  append(record: Omit<NarrativeRecord, 'createdAt'>): Promise<NarrativeRecord>;
}

export const NARRATIVE_REPOSITORY = Symbol('NARRATIVE_REPOSITORY');
