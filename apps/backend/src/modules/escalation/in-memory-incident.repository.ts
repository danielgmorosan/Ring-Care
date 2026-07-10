import { Injectable } from '@nestjs/common';
import type { RecordStepInput } from './temporal/types';
import {
  Incident,
  IncidentRepository,
  IncidentStepView,
  TERMINAL_STEP_KINDS,
} from './incident.repository';

@Injectable()
export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly incidents = new Map<string, Incident>();
  private readonly steps = new Map<string, RecordStepInput[]>();
  private readonly seen = new Set<string>();

  async open(incident: Incident): Promise<void> {
    this.incidents.set(incident.id, incident);
  }

  async appendStep(step: RecordStepInput): Promise<void> {
    const key = `${step.incidentId}|${step.seq}`;
    if (this.seen.has(key)) return; // idempotent on (incidentId, seq)
    this.seen.add(key);
    const list = this.steps.get(step.incidentId) ?? [];
    list.push(step);
    this.steps.set(step.incidentId, list);
  }

  async countSteps(incidentId: string): Promise<number> {
    return this.steps.get(incidentId)?.length ?? 0;
  }

  async listStepKinds(incidentId: string): Promise<string[]> {
    return (this.steps.get(incidentId) ?? []).sort((a, b) => a.seq - b.seq).map((s) => s.kind);
  }

  async listByFamily(familyId: string): Promise<Incident[]> {
    return [...this.incidents.values()]
      .filter((i) => i.familyId === familyId)
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  async findById(incidentId: string): Promise<Incident | null> {
    return this.incidents.get(incidentId) ?? null;
  }

  async hasActiveForDevice(deviceId: string): Promise<boolean> {
    const terminal = new Set<string>(TERMINAL_STEP_KINDS);
    for (const incident of this.incidents.values()) {
      if (incident.deviceId !== deviceId) continue;
      const kinds = (this.steps.get(incident.id) ?? []).map((s) => s.kind);
      if (!kinds.some((k) => terminal.has(k))) return true; // no terminal step -> still active
    }
    return false;
  }

  async findActiveForDevice(deviceId: string): Promise<Incident | null> {
    const terminal = new Set<string>(TERMINAL_STEP_KINDS);
    const active = [...this.incidents.values()]
      .filter((i) => i.deviceId === deviceId)
      .filter((i) => !(this.steps.get(i.id) ?? []).some((s) => terminal.has(s.kind)))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return active[0] ?? null;
  }

  async hasRecentEmergencyForDevice(deviceId: string, since: string): Promise<boolean> {
    for (const incident of this.incidents.values()) {
      if (incident.deviceId !== deviceId) continue;
      if (incident.openedAt < since) continue;
      const kinds = (this.steps.get(incident.id) ?? []).map((s) => s.kind);
      if (kinds.includes('emergency_notified')) return true;
    }
    return false;
  }

  async listSteps(incidentId: string): Promise<IncidentStepView[]> {
    // In-memory steps carry no contact name or timestamp; those are only on the pg path.
    return (this.steps.get(incidentId) ?? [])
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((s) => ({
        seq: s.seq,
        kind: s.kind,
        contactName: null,
        contactRole: null,
        detail: s.detail,
        occurredAt: null,
      }));
  }
}
