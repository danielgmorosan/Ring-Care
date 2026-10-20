import type {
  CareProposalDecision,
  DecisionResult,
  ProposalItem,
  StoredCareProposal,
} from './care-proposal.entity';

export interface NewCareProposal {
  familyId: string;
  source: 'bee';
  sourceRef: string;
  summary: string;
  items: ProposalItem[];
  extractedBy: string;
}

export interface NewCareProposalDecision {
  proposalId: string;
  decision: 'approved' | 'rejected';
  itemIds: string[];
  decidedBy: string | null;
  result: DecisionResult;
}

/**
 * Append-only store for proposals and decisions (rule #2). There is no update or delete:
 * a second write for the same key returns the existing row instead.
 */
export interface CareProposalRepository {
  /** Inserts, or returns the existing proposal for (family, source, sourceRef). */
  createIfAbsent(p: NewCareProposal): Promise<{ proposal: StoredCareProposal; created: boolean }>;
  findBySourceRef(
    familyId: string,
    source: 'bee',
    sourceRef: string,
  ): Promise<StoredCareProposal | null>;
  findById(familyId: string, id: string): Promise<StoredCareProposal | null>;
  listByFamily(familyId: string): Promise<StoredCareProposal[]>;
  /** Inserts, or returns the existing decision for the proposal. */
  recordDecision(
    d: NewCareProposalDecision,
  ): Promise<{ decision: CareProposalDecision; created: boolean }>;
  findDecision(proposalId: string): Promise<CareProposalDecision | null>;
  listDecisions(proposalIds: string[]): Promise<CareProposalDecision[]>;
}

export const CARE_PROPOSAL_REPOSITORY = Symbol('CARE_PROPOSAL_REPOSITORY');
