import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/env.validation';
import { MedicationsService } from '../care/medications.service';
import { FamiliesService } from '../families/families.service';
import { normalizeTimeZone } from '../families/timezone';
import { BEE_API_PORT, type BeeApiPort, type BeeConversation } from './bee-api.port';
import { isConversationEvent, parseBeeWebhook } from './bee-webhook.parser';
import type { ProposalItem } from './care-proposal.entity';
import { CARE_PROPOSAL_REPOSITORY, type CareProposalRepository } from './care-proposal.repository';
import { CareExtractorService } from './extraction/care-extractor.service';

export type IngestOutcome =
  | 'created'
  | 'duplicate'
  | 'ignored_event'
  | 'not_found'
  | 'in_progress'
  | 'no_care_content'
  | 'failed';

export interface WebhookAck {
  accepted: boolean;
  event: string | null;
  conversationId: string | null;
}

/** Bee states that mean the conversation is still being captured or transcribed. */
const IN_PROGRESS_STATES = /^(capturing|recording|processing|in_progress|active|pending)$/i;

/**
 * Turns Bee conversation events into pending care proposals for BEE_FAMILY_ID
 * (decision 0012). The webhook acknowledges immediately; the fetch and extraction run
 * after the response. Idempotent per conversation: the proposal's (family, source_ref)
 * key is unique, and concurrent events for one conversation share one run.
 */
@Injectable()
export class BeeIngestService {
  private readonly logger = new Logger(BeeIngestService.name);
  private readonly inFlight = new Map<string, Promise<IngestOutcome>>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(
    private readonly config: AppConfig,
    @Inject(BEE_API_PORT) private readonly bee: BeeApiPort,
    @Inject(CARE_PROPOSAL_REPOSITORY) private readonly proposals: CareProposalRepository,
    private readonly extractor: CareExtractorService,
    private readonly families: FamiliesService,
    private readonly medications: MedicationsService,
  ) {}

  /** Acknowledges a webhook body and schedules processing. Never throws. */
  accept(body: unknown): WebhookAck {
    const { eventType, conversationId } = parseBeeWebhook(body);
    const familyId = this.config.beeFamilyId;
    if (!familyId || !conversationId || !isConversationEvent(eventType)) {
      return { accepted: false, event: eventType, conversationId };
    }
    const work = this.processConversation(familyId, conversationId);
    this.background.add(work);
    void work.finally(() => this.background.delete(work));
    return { accepted: true, event: eventType, conversationId };
  }

  /** Resolves once all scheduled processing has finished (tests, graceful shutdown). */
  async whenIdle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  processConversation(familyId: string, conversationId: string): Promise<IngestOutcome> {
    const key = `${familyId}:${conversationId}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const work = this.run(familyId, conversationId)
      .catch((err: unknown) => {
        this.logger.error(`Bee conversation ${conversationId} failed: ${(err as Error).message}`);
        return 'failed' as const;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  private async run(familyId: string, conversationId: string): Promise<IngestOutcome> {
    if (await this.proposals.findBySourceRef(familyId, 'bee', conversationId)) return 'duplicate';

    const conversation = await this.bee.getConversation(conversationId);
    if (!conversation) return 'not_found';
    if (conversation.state && IN_PROGRESS_STATES.test(conversation.state)) return 'in_progress';

    const text = noteText(conversation);
    if (!text) return 'no_care_content';

    const family = await this.families.findByIdOrFail(familyId);
    const meds = await this.medications.list(familyId);
    const extraction = await this.extractor.extract({
      text,
      spokenAt: conversation.startedAt ?? new Date().toISOString(),
      timezone: normalizeTimeZone(family.timezone),
      currentMedications: meds.map((m) => ({ name: m.name, dosage: m.dosage, times: m.times })),
    });
    if (extraction.items.length === 0) return 'no_care_content';

    const items: ProposalItem[] = extraction.items.map((item) => ({ ...item, id: uuidv4() }));
    const { created } = await this.proposals.createIfAbsent({
      familyId,
      source: 'bee',
      sourceRef: conversationId,
      summary: extraction.summary,
      items,
      extractedBy: extraction.extractedBy,
    });
    if (created) {
      this.logger.log(
        `Care proposal from Bee conversation ${conversationId}: ${items.length} item(s) via ${extraction.extractedBy}`,
      );
    }
    return created ? 'created' : 'duplicate';
  }
}

/**
 * The caregiver's words, for extraction only; never stored. Transcript first, then
 * Bee's summaries when no transcript is available.
 */
export function noteText(c: BeeConversation): string {
  const transcript = c.utterances
    .map((u) => u.text.trim())
    .filter(Boolean)
    .join('\n');
  return (transcript || c.summary || c.shortSummary || '').trim();
}
