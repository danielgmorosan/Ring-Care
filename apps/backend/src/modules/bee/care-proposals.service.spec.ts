import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentsService } from '../care/appointments.service';
import { InMemoryAppointmentRepository } from '../care/in-memory-appointment.repository';
import { InMemoryMedicationRepository } from '../care/in-memory-medication.repository';
import { MedicationsService } from '../care/medications.service';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import type { ProposalItem } from './care-proposal.entity';
import { CareProposalsService } from './care-proposals.service';
import { extractWithRules } from './extraction/rules-extractor';
import { InMemoryCareProposalRepository } from './in-memory-care-proposal.repository';
import { FakeBeeApi } from './testing/fake-bee-api';

const DEMO =
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the new prescription";

describe('CareProposalsService', () => {
  let families: FamiliesService;
  let medications: MedicationsService;
  let appointments: AppointmentsService;
  let repo: InMemoryCareProposalRepository;
  let bee: FakeBeeApi;
  let service: CareProposalsService;
  let familyId: string;
  let otherFamilyId: string;

  async function seedProposal(text = DEMO, ref = 'conv-1') {
    const { items } = extractWithRules({
      text,
      today: '2026-10-20',
      knownMedications: ['Donepezil'],
    });
    const withIds: ProposalItem[] = items.map((item, i) => ({
      ...item,
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    }));
    const { proposal } = await repo.createIfAbsent({
      familyId,
      source: 'bee',
      sourceRef: ref,
      summary: 'From your note',
      items: withIds,
      extractedBy: 'rules:v1',
    });
    return proposal;
  }

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    otherFamilyId = (await families.create({ name: 'Other', timezone: 'UTC' })).id;
    medications = new MedicationsService(new InMemoryMedicationRepository(), families);
    appointments = new AppointmentsService(new InMemoryAppointmentRepository(), families);
    repo = new InMemoryCareProposalRepository();
    bee = new FakeBeeApi();
    // "Now" is the afternoon of the note, Tuesday 20 October 2026.
    const clock = () => new Date('2026-10-20T14:00:00.000Z');
    service = new CareProposalsService(repo, bee, families, medications, appointments, clock);
    await medications.create(familyId, { name: 'Donepezil', dosage: '10 mg', times: ['08:00'] });
  });

  it('lists pending proposals in the contract shape', async () => {
    const p = await seedProposal();
    const list = await service.list(familyId, 'pending');
    expect(list).toEqual([
      {
        id: p.id,
        source: 'bee',
        createdAt: p.createdAt,
        summary: 'From your note',
        status: 'pending',
        items: p.items,
      },
    ]);
    expect(await service.list(familyId, 'approved')).toEqual([]);
    expect(await service.list(otherFamilyId)).toEqual([]);
  });

  it('approves everything: schedules the dose change, books the appointment, creates Bee todos', async () => {
    const p = await seedProposal();
    const [medItem, apptItem, todoItem] = p.items;
    const result = await service.approve(familyId, 'user-1', p.id);
    expect(result).toEqual({
      applied: [apptItem!.id, todoItem!.id],
      scheduled: [medItem!.id],
      todosCreated: 3,
    });

    // "From Monday": today (Tuesday 20 October) Mom keeps her current dose.
    const [med] = await medications.list(familyId);
    expect(med).toMatchObject({ name: 'Donepezil', dosage: '10 mg', times: ['08:00'] });
    expect(med!.notes).toBe('From Monday 26 October: 5 mg at 20:00.');

    const [appt] = await appointments.list(familyId);
    // 09:00 Lisbon on 3 November (UTC+0 after DST) because the note gave no time.
    expect(appt).toMatchObject({ title: 'Blood test', at: '2026-11-03T09:00:00.000Z' });
    expect(appt!.notes).toContain('No time was given');

    expect(bee.todos).toEqual([
      // The morning the change starts, 08:00 Lisbon on Monday 26 October (UTC+0 after DST).
      {
        id: 'todo-1',
        text: 'Donepezil changes to 5 mg at 20:00 today',
        alarmAt: '2026-10-26T08:00:00.000Z',
      },
      // The appointment reminder, the evening before at 18:00 Lisbon.
      { id: 'todo-2', text: 'Tomorrow: Blood test', alarmAt: '2026-11-02T18:00:00.000Z' },
      { id: 'todo-3', text: 'Pick up the new prescription', alarmAt: null },
    ]);

    const [view] = await service.list(familyId, 'approved');
    expect(view!.decision?.result.items.map((i) => i.status)).toEqual([
      'scheduled',
      'applied',
      'applied',
    ]);
    expect(view!.decision?.result.items[0]).toMatchObject({
      medicationId: med!.id,
      beeTodoId: 'todo-1',
    });
  });

  it('applies only the chosen items', async () => {
    const p = await seedProposal();
    const todoItem = p.items.find((i) => i.kind === 'todo')!;
    const result = await service.approve(familyId, 'user-1', p.id, [todoItem.id]);
    expect(result).toEqual({ applied: [todoItem.id], scheduled: [], todosCreated: 1 });
    expect((await medications.list(familyId))[0]).toMatchObject({
      dosage: '10 mg',
      times: ['08:00'],
    });
    expect(await appointments.list(familyId)).toEqual([]);
    expect(bee.todos.map((t) => t.text)).toEqual(['Pick up the new prescription']);
  });

  it('is idempotent: a repeated approval answers from the record and applies nothing again', async () => {
    const p = await seedProposal();
    const [first, second] = await Promise.all([
      service.approve(familyId, 'user-1', p.id),
      service.approve(familyId, 'user-1', p.id),
    ]);
    expect(second).toEqual(first);
    const third = await service.approve(familyId, 'user-1', p.id, [p.items[0]!.id]);
    expect(third).toEqual(first);
    expect(bee.todos).toHaveLength(3);
    expect(await appointments.list(familyId)).toHaveLength(1);
  });

  it('rejects without touching the care plan, and is idempotent', async () => {
    const p = await seedProposal();
    const view = await service.reject(familyId, 'user-1', p.id);
    expect(view.status).toBe('rejected');
    expect((await service.reject(familyId, 'user-1', p.id)).status).toBe('rejected');
    expect((await medications.list(familyId))[0]!.dosage).toBe('10 mg');
    expect(bee.todos).toEqual([]);
    await expect(service.approve(familyId, 'user-1', p.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses to reject an approved proposal', async () => {
    const p = await seedProposal();
    await service.approve(familyId, 'user-1', p.id);
    await expect(service.reject(familyId, 'user-1', p.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('validates item ids and family scope', async () => {
    const p = await seedProposal();
    await expect(
      service.approve(familyId, 'user-1', p.id, ['00000000-0000-4000-8000-0000000000ff']),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.approve(familyId, 'user-1', p.id, [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.approve(otherFamilyId, 'user-1', p.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.list(familyId, 'pending')).toHaveLength(1);
  });

  it('keeps going when Bee is down: care changes apply, todo items are marked failed', async () => {
    bee.failTodos = true;
    const p = await seedProposal();
    const result = await service.approve(familyId, 'user-1', p.id);
    const [medItem, apptItem, todoItem] = p.items;
    expect(result).toEqual({ applied: [apptItem!.id], scheduled: [medItem!.id], todosCreated: 0 });
    const [view] = await service.list(familyId);
    const items = view!.decision!.result.items;
    expect(items[0]).toMatchObject({ status: 'scheduled', beeTodoError: 'Bee unavailable' });
    expect(items[1]).toMatchObject({ status: 'applied', beeTodoError: 'Bee unavailable' });
    expect(items[2]).toMatchObject({ itemId: todoItem!.id, status: 'failed' });
  });

  it('adds a medication that is not on the list yet, and notes are acknowledged only', async () => {
    const p = await seedProposal(
      'She was prescribed Memantine 10 mg at 9 am, stop the Aspirin',
      'conv-2',
    );
    expect(p.items.map((i) => i.kind)).toEqual(['new_medication', 'note']);
    const result = await service.approve(familyId, 'user-1', p.id);
    expect(result).toEqual({ applied: [p.items[0]!.id], scheduled: [], todosCreated: 0 });
    const names = (await medications.list(familyId)).map((m) => m.name);
    expect(names).toEqual(['Donepezil', 'Memantine']);
  });

  describe('a dose change with a start date', () => {
    async function medicationItem(startDate: string | null, name = 'Donepezil') {
      const item: ProposalItem = {
        id: '00000000-0000-4000-8000-0000000000a1',
        kind: name === 'Donepezil' ? 'medication_change' : 'new_medication',
        title: `${name} to 5 mg at 20:00`,
        detail: '',
        data: { medicationName: name, dose: '5 mg', times: ['20:00'], startDate },
      };
      const { proposal } = await repo.createIfAbsent({
        familyId,
        source: 'bee',
        sourceRef: `conv-start-${startDate ?? 'none'}-${name}`,
        summary: 'From your note',
        items: [item],
        extractedBy: 'rules:v1',
      });
      return proposal;
    }

    it.each([
      ['today', '2026-10-20'],
      ['a past date', '2026-10-12'],
      ['no date', null],
    ])('applies immediately when the start date is %s', async (_label, startDate) => {
      const p = await medicationItem(startDate);
      const result = await service.approve(familyId, 'user-1', p.id);
      expect(result).toEqual({ applied: [p.items[0]!.id], scheduled: [], todosCreated: 0 });
      expect((await medications.list(familyId))[0]).toMatchObject({
        dosage: '5 mg',
        times: ['20:00'],
      });
      expect(bee.todos).toEqual([]);
    });

    it('uses the family timezone for "today"', async () => {
      // 23:30Z on 20 October is already 21 October in Tokyo: a start on the 21st is today.
      const tokyo = await families.create({ name: 'Tokyo family', timezone: 'Asia/Tokyo' });
      familyId = tokyo.id;
      await medications.create(familyId, { name: 'Donepezil', dosage: '10 mg', times: ['08:00'] });
      service = new CareProposalsService(
        repo,
        bee,
        families,
        medications,
        appointments,
        () => new Date('2026-10-20T23:30:00.000Z'),
      );
      const p = await medicationItem('2026-10-21');
      await service.approve(familyId, 'user-1', p.id);
      expect((await medications.list(familyId))[0]!.dosage).toBe('5 mg');
    });

    it('a new medication starting later is listed with its note but no dose times yet', async () => {
      const p = await medicationItem('2026-10-26', 'Memantine');
      const result = await service.approve(familyId, 'user-1', p.id);
      expect(result.scheduled).toEqual([p.items[0]!.id]);
      const memantine = (await medications.list(familyId)).find((m) => m.name === 'Memantine');
      expect(memantine).toMatchObject({ dosage: null, times: [] });
      expect(memantine!.notes).toBe(
        'From Monday 26 October: 5 mg at 20:00. Added from a Bee note.',
      );
      expect(bee.todos).toEqual([
        {
          id: 'todo-1',
          text: 'Memantine starts today: 5 mg at 20:00',
          alarmAt: '2026-10-26T08:00:00.000Z',
        },
      ]);
    });
  });

  it('sets a todo alarm from its due date and drops alarms in the past', async () => {
    const future = await seedProposal('Book the eye test by Friday', 'conv-3');
    await service.approve(familyId, 'user-1', future.id);
    // Friday 23 October, 09:00 Lisbon (UTC+1).
    expect(bee.todos[0]).toMatchObject({
      text: 'Book the eye test',
      alarmAt: '2026-10-23T08:00:00.000Z',
    });

    const soon = await seedProposal('Blood test tomorrow', 'conv-4');
    await service.approve(familyId, 'user-1', soon.id);
    // The reminder would be 18:00 today Lisbon (17:00Z), after "now" at 14:00Z: kept.
    expect(bee.todos[1]).toMatchObject({
      text: 'Tomorrow: Blood test',
      alarmAt: '2026-10-20T17:00:00.000Z',
    });

    const today = await seedProposal('Blood test today', 'conv-5');
    await service.approve(familyId, 'user-1', today.id);
    // Yesterday evening is in the past: the todo is created without an alarm.
    expect(bee.todos[2]).toMatchObject({ text: 'Tomorrow: Blood test', alarmAt: null });
  });
});
