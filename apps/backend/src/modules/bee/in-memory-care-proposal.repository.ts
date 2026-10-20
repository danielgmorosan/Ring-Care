import { v4 as uuidv4 } from 'uuid';
import type { CareProposalDecision, StoredCareProposal } from './care-proposal.entity';
import type {
  CareProposalRepository,
  NewCareProposal,
  NewCareProposalDecision,
} from './care-proposal.repository';

/** In-memory append-only store (dev and tests). Rows are frozen copies. */
export class InMemoryCareProposalRepository implements CareProposalRepository {
  private readonly proposals: StoredCareProposal[] = [];
  private readonly decisions = new Map<string, CareProposalDecision>();
  private seq = 0;

  async createIfAbsent(p: NewCareProposal) {
    const existing = await this.findBySourceRef(p.familyId, p.source, p.sourceRef);
    if (existing) return { proposal: existing, created: false };
    const proposal: StoredCareProposal = structuredClone({
      id: uuidv4(),
      ...p,
      createdAt: new Date(Date.UTC(2026, 0, 1) + this.seq++ * 1000).toISOString(),
    });
    this.proposals.push(proposal);
    return { proposal: structuredClone(proposal), created: true };
  }

  async findBySourceRef(familyId: string, source: 'bee', sourceRef: string) {
    const p = this.proposals.find(
      (x) => x.familyId === familyId && x.source === source && x.sourceRef === sourceRef,
    );
    return p ? structuredClone(p) : null;
  }

  async findById(familyId: string, id: string) {
    const p = this.proposals.find((x) => x.familyId === familyId && x.id === id);
    return p ? structuredClone(p) : null;
  }

  async listByFamily(familyId: string) {
    return this.proposals
      .filter((x) => x.familyId === familyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => structuredClone(p));
  }

  async recordDecision(d: NewCareProposalDecision) {
    const existing = this.decisions.get(d.proposalId);
    if (existing) return { decision: structuredClone(existing), created: false };
    const decision: CareProposalDecision = structuredClone({
      id: uuidv4(),
      ...d,
      decidedAt: new Date().toISOString(),
    });
    this.decisions.set(d.proposalId, decision);
    return { decision: structuredClone(decision), created: true };
  }

  async findDecision(proposalId: string) {
    const d = this.decisions.get(proposalId);
    return d ? structuredClone(d) : null;
  }

  async listDecisions(proposalIds: string[]) {
    return proposalIds
      .map((id) => this.decisions.get(id))
      .filter((d): d is CareProposalDecision => Boolean(d))
      .map((d) => structuredClone(d));
  }
}
