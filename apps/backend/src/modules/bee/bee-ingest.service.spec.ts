import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../config/env.validation';
import type { LlmPort } from '../ai/llm.port';
import { InMemoryMedicationRepository } from '../care/in-memory-medication.repository';
import { MedicationsService } from '../care/medications.service';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { BeeIngestService } from './bee-ingest.service';
import { CareExtractorService } from './extraction/care-extractor.service';
import { InMemoryCareProposalRepository } from './in-memory-care-proposal.repository';
import { FakeBeeApi } from './testing/fake-bee-api';

const DEMO =
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the new prescription";

describe('BeeIngestService', () => {
  let bee: FakeBeeApi;
  let repo: InMemoryCareProposalRepository;
  let familyId: string;
  let llmCalls: number;
  let ingest: BeeIngestService;
  let medications: MedicationsService;

  beforeEach(async () => {
    const families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    medications = new MedicationsService(new InMemoryMedicationRepository(), families);
    bee = new FakeBeeApi();
    repo = new InMemoryCareProposalRepository();
    llmCalls = 0;
    // The mock provider: extraction falls back to the rules extractor.
    const llm: LlmPort = {
      complete: async () => {
        llmCalls++;
        return { text: '{"mock":true}', provider: 'mock', model: 'mock' };
      },
    };
    const config = { beeFamilyId: familyId } as unknown as AppConfig;
    ingest = new BeeIngestService(
      config,
      bee,
      repo,
      new CareExtractorService(llm),
      families,
      medications,
    );
  });

  it('turns a new conversation into one pending proposal for BEE_FAMILY_ID', async () => {
    bee.addNote('conv-1', DEMO);
    const ack = ingest.accept({
      event: 'new-conversation',
      data: { conversation: { id: 'conv-1' } },
    });
    expect(ack).toEqual({ accepted: true, event: 'new-conversation', conversationId: 'conv-1' });
    await ingest.whenIdle();

    const [proposal, ...rest] = await repo.listByFamily(familyId);
    expect(rest).toHaveLength(0);
    expect(proposal).toMatchObject({ source: 'bee', sourceRef: 'conv-1', extractedBy: 'rules:v1' });
    expect(proposal!.items.map((i) => i.kind)).toEqual([
      'medication_change',
      'appointment',
      'todo',
    ]);
    expect(proposal!.items.every((i) => /^[0-9a-f-]{36}$/.test(i.id))).toBe(true);
    // Only derived summary and items are stored, never the transcript itself.
    expect(JSON.stringify(proposal)).not.toContain('"utterances"');
  });

  it('is idempotent across replays and the follow-up summary event', async () => {
    bee.addNote('conv-1', DEMO);
    ingest.accept({ event: 'new-conversation', data: { conversation: { id: 'conv-1' } } });
    ingest.accept({ event: 'new-conversation', data: { conversation: { id: 'conv-1' } } });
    await ingest.whenIdle();
    ingest.accept({ event: 'update-conversation-summary', data: { conversation_id: 'conv-1' } });
    await ingest.whenIdle();

    expect(await repo.listByFamily(familyId)).toHaveLength(1);
    // Concurrent events share one run; the later one stops at the stored proposal.
    expect(llmCalls).toBe(1);
    expect(bee.getCalls).toBe(1);
    expect(await ingest.processConversation(familyId, 'conv-1')).toBe('duplicate');
  });

  it('ignores conversations with no care content', async () => {
    bee.addNote('chat', 'We talked about the garden and the grandchildren');
    expect(await ingest.processConversation(familyId, 'chat')).toBe('no_care_content');
    expect(await repo.listByFamily(familyId)).toHaveLength(0);
  });

  it('waits for a conversation still being captured, then processes the summary event', async () => {
    bee.addNote('conv-2', DEMO, undefined, 'CAPTURING');
    expect(await ingest.processConversation(familyId, 'conv-2')).toBe('in_progress');
    bee.addNote('conv-2', DEMO);
    expect(await ingest.processConversation(familyId, 'conv-2')).toBe('created');
  });

  it('handles unknown conversations and unrelated events without failing', async () => {
    expect(await ingest.processConversation(familyId, 'missing')).toBe('not_found');
    const ack = ingest.accept({ event: 'new-utterance', data: { conversation_uuid: 'conv-1' } });
    expect(ack.accepted).toBe(false);
    expect(ingest.accept('garbage').accepted).toBe(false);
    await ingest.whenIdle();
    expect(bee.getCalls).toBe(1);
  });

  it('records a failure when Bee errors, without throwing', async () => {
    bee.getConversation = async () => {
      throw new Error('Bee down');
    };
    expect(await ingest.processConversation(familyId, 'conv-1')).toBe('failed');
  });

  it('uses the current medication list so a known name is a change', async () => {
    await medications.create(familyId, { name: 'Donepezil', dosage: '10 mg', times: ['08:00'] });
    bee.addNote('conv-3', 'donepezil now 5 mg at 8 pm');
    await ingest.processConversation(familyId, 'conv-3');
    const [proposal] = await repo.listByFamily(familyId);
    expect(proposal!.items[0]).toMatchObject({
      kind: 'medication_change',
      data: { medicationName: 'Donepezil', dose: '5 mg', times: ['20:00'] },
    });
  });
});
