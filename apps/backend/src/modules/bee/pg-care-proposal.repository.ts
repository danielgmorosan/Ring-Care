import { Pool, QueryResultRow } from 'pg';
import type {
  CareProposalDecision,
  DecisionResult,
  ProposalItem,
  StoredCareProposal,
} from './care-proposal.entity';
import type {
  CareProposalRepository,
  NewCareProposal,
  NewCareProposalDecision,
} from './care-proposal.repository';

interface ProposalRow extends QueryResultRow {
  id: string;
  family_id: string;
  source: 'bee';
  source_ref: string;
  summary: string;
  items: ProposalItem[];
  extracted_by: string;
  created_at: Date;
}

interface DecisionRow extends QueryResultRow {
  id: string;
  proposal_id: string;
  decision: 'approved' | 'rejected';
  item_ids: string[];
  decided_by: string | null;
  decided_at: Date;
  result: DecisionResult;
}

const PROPOSAL_COLS = 'id, family_id, source, source_ref, summary, items, extracted_by, created_at';
const DECISION_COLS = 'id, proposal_id, decision, item_ids, decided_by, decided_at, result';

function toProposal(r: ProposalRow): StoredCareProposal {
  return {
    id: r.id,
    familyId: r.family_id,
    source: r.source,
    sourceRef: r.source_ref,
    summary: r.summary,
    items: r.items,
    extractedBy: r.extracted_by,
    createdAt: r.created_at.toISOString(),
  };
}

function toDecision(r: DecisionRow): CareProposalDecision {
  return {
    id: r.id,
    proposalId: r.proposal_id,
    decision: r.decision,
    itemIds: r.item_ids,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at.toISOString(),
    result: r.result,
  };
}

/** Postgres store. INSERT only; uniqueness is the idempotency guard (migration 030). */
export class PgCareProposalRepository implements CareProposalRepository {
  constructor(private readonly pool: Pool) {}

  async createIfAbsent(p: NewCareProposal) {
    const { rows } = await this.pool.query<ProposalRow>(
      `INSERT INTO care_proposals (family_id, source, source_ref, summary, items, extracted_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (family_id, source, source_ref) DO NOTHING
       RETURNING ${PROPOSAL_COLS}`,
      [p.familyId, p.source, p.sourceRef, p.summary, JSON.stringify(p.items), p.extractedBy],
    );
    if (rows[0]) return { proposal: toProposal(rows[0]), created: true };
    const existing = await this.findBySourceRef(p.familyId, p.source, p.sourceRef);
    if (!existing) throw new Error('care proposal conflict without an existing row');
    return { proposal: existing, created: false };
  }

  async findBySourceRef(familyId: string, source: 'bee', sourceRef: string) {
    const { rows } = await this.pool.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLS} FROM care_proposals
        WHERE family_id = $1 AND source = $2 AND source_ref = $3`,
      [familyId, source, sourceRef],
    );
    return rows[0] ? toProposal(rows[0]) : null;
  }

  async findById(familyId: string, id: string) {
    const { rows } = await this.pool.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLS} FROM care_proposals WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toProposal(rows[0]) : null;
  }

  async listByFamily(familyId: string) {
    const { rows } = await this.pool.query<ProposalRow>(
      `SELECT ${PROPOSAL_COLS} FROM care_proposals
        WHERE family_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [familyId],
    );
    return rows.map(toProposal);
  }

  async recordDecision(d: NewCareProposalDecision) {
    const { rows } = await this.pool.query<DecisionRow>(
      `INSERT INTO care_proposal_decisions (proposal_id, decision, item_ids, decided_by, result)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)
       ON CONFLICT (proposal_id) DO NOTHING
       RETURNING ${DECISION_COLS}`,
      [d.proposalId, d.decision, JSON.stringify(d.itemIds), d.decidedBy, JSON.stringify(d.result)],
    );
    if (rows[0]) return { decision: toDecision(rows[0]), created: true };
    const existing = await this.findDecision(d.proposalId);
    if (!existing) throw new Error('care proposal decision conflict without an existing row');
    return { decision: existing, created: false };
  }

  async findDecision(proposalId: string) {
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT ${DECISION_COLS} FROM care_proposal_decisions WHERE proposal_id = $1`,
      [proposalId],
    );
    return rows[0] ? toDecision(rows[0]) : null;
  }

  async listDecisions(proposalIds: string[]) {
    if (proposalIds.length === 0) return [];
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT ${DECISION_COLS} FROM care_proposal_decisions WHERE proposal_id = ANY($1::uuid[])`,
      [proposalIds],
    );
    return rows.map(toDecision);
  }
}
