/** One recorded action in the append-only access log (rule #7). */
export interface AccessLogEntry {
  id: string;
  familyId: string;
  userId: string | null;
  /** Semantic action, e.g. 'medication.create'. */
  action: string;
  method: string;
  route: string;
  at: string;
}

export interface NewAccessLog {
  familyId: string;
  userId: string | null;
  action: string;
  method: string;
  route: string;
}

/** Append-only store for the access log. Corrections would be new rows, never edits. */
export interface AccessLogRepository {
  record(entry: NewAccessLog): Promise<void>;
  listByFamily(familyId: string, limit: number): Promise<AccessLogEntry[]>;
}

export const ACCESS_LOG_REPOSITORY = Symbol('ACCESS_LOG_REPOSITORY');
