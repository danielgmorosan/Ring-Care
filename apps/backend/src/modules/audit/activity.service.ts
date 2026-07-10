import { Inject, Injectable } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from './access-log.repository';
import { actionLabel } from './audit-action';

export interface ActivityItem {
  id: string;
  at: string;
  /** Warm, human sentence, e.g. "Added a medication". */
  label: string;
}

/** The caregiver-facing activity history, read from the append-only access log. */
@Injectable()
export class ActivityService {
  constructor(
    @Inject(ACCESS_LOG_REPOSITORY) private readonly log: AccessLogRepository,
    private readonly families: FamiliesService,
  ) {}

  async forFamily(familyId: string, limit = 50): Promise<ActivityItem[]> {
    await this.families.findByIdOrFail(familyId);
    const entries = await this.log.listByFamily(familyId, limit);
    return entries.map((e) => ({ id: e.id, at: e.at, label: actionLabel(e.action) }));
  }
}
