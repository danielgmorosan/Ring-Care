import { addDays, addMonths, nextWeekday, zonedTimeToUtc } from './calendar';
import { extractWithRules, findDate, findTime, splitClauses } from './rules-extractor';

const DEMO =
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the new prescription";
// 2026-10-20 is a Tuesday.
const TODAY = '2026-10-20';

describe('rules extractor', () => {
  it('extracts the demo sentence into a medication change, an appointment and a todo', () => {
    const { items, summary } = extractWithRules({ text: DEMO, today: TODAY });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      kind: 'medication_change',
      title: 'Donepezil to 5 mg at 20:00 from Monday 26 October',
      data: {
        medicationName: 'Donepezil',
        dose: '5 mg',
        times: ['20:00'],
        startDate: '2026-10-26',
      },
    });
    expect(items[1]).toMatchObject({
      kind: 'appointment',
      title: 'Blood test on Tuesday 3 November',
      data: { title: 'Blood test', date: '2026-11-03', time: null, location: null },
    });
    expect(items[2]).toMatchObject({
      kind: 'todo',
      title: 'Pick up the new prescription',
      data: { text: 'Pick up the new prescription', dueDate: null, dueTime: null },
    });
    expect(summary).toContain('From your note: Donepezil to 5 mg');
    expect(summary).not.toMatch(/—/);
  });

  it('keeps the source words as the detail for every item', () => {
    const { items } = extractWithRules({ text: DEMO, today: TODAY });
    expect(items[0]!.detail).toBe(`You said: "Mom's Donepezil goes to 5 mg at 8 pm from Monday".`);
    expect(items[1]!.detail).toContain('No time was given');
  });

  it('handles common variants of the phrasing', () => {
    const { items } = extractWithRules({
      text:
        "Dad's bisoprolol is reduced to 2.5 milligrams at 8 in the morning starting tomorrow. " +
        'Cardiology appointment on 12 November at 10:30. Remember to book the eye test.',
      today: TODAY,
      knownMedications: ['Bisoprolol'],
    });
    expect(items.map((i) => i.kind)).toEqual(['medication_change', 'appointment', 'todo']);
    expect(items[0]!.data).toEqual({
      medicationName: 'Bisoprolol',
      dose: '2.5 mg',
      times: ['08:00'],
      startDate: '2026-10-21',
    });
    expect(items[1]!.data).toEqual({
      title: 'Cardiology appointment',
      date: '2026-11-12',
      time: '10:30',
      location: null,
    });
    expect(items[2]).toMatchObject({ kind: 'todo', data: { text: 'Book the eye test' } });
  });

  it('proposes a new medication when the note starts one that is not on the list', () => {
    const { items } = extractWithRules({
      text: 'She was prescribed Memantine 10 mg at 9 am',
      today: TODAY,
      knownMedications: ['Donepezil'],
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'new_medication',
        data: { medicationName: 'Memantine', dose: '10 mg', times: ['09:00'], startDate: null },
      }),
    ]);
  });

  it('never invents: vague dates and stops become notes, unrelated talk is ignored', () => {
    const { items } = extractWithRules({
      text: 'Blood test sometime next week, stop the Aspirin, the weather was lovely',
      today: TODAY,
      knownMedications: ['Aspirin'],
    });
    expect(items.map((i) => i.kind)).toEqual(['note', 'note']);
    expect(items[0]!.data).toEqual({ text: 'Blood test sometime next week' });
    expect(items[1]!.data).toEqual({ text: 'Stop the Aspirin' });
  });

  it('returns nothing for a conversation with no care content', () => {
    expect(
      extractWithRules({ text: 'Lovely lunch with Ana, we talked about the garden', today: TODAY })
        .items,
    ).toEqual([]);
  });

  it('does not guess an am/pm the caregiver did not say', () => {
    expect(findTime('take it at 8')).toBeNull();
    expect(findTime('at 8 pm')?.value).toBe('20:00');
    expect(findTime('at 12am')?.value).toBe('00:00');
    expect(findTime('8:30am')?.value).toBe('08:30');
    expect(findTime('20h00')?.value).toBe('20:00');
    expect(findTime('at noon')?.value).toBe('12:00');
  });

  it('resolves relative dates against the note day', () => {
    expect(findDate('from Monday', TODAY)?.value).toBe('2026-10-26');
    expect(findDate('from Monday', '2026-10-26')?.value).toBe('2026-11-02');
    expect(findDate('in two weeks', TODAY)?.value).toBe('2026-11-03');
    expect(findDate('in 3 days', TODAY)?.value).toBe('2026-10-23');
    expect(findDate('in a month', '2026-01-31')?.value).toBe('2026-02-28');
    expect(findDate('tomorrow', TODAY)?.value).toBe('2026-10-21');
    expect(findDate('on 5 January', TODAY)?.value).toBe('2027-01-05');
    expect(findDate('next week', TODAY)).toBeNull();
    expect(findDate('on 31 February', TODAY)).toBeNull();
  });

  it('splits clauses on commas, sentence ends and "also"', () => {
    expect(splitClauses('a, b. c also d\ne 2.5 mg')).toEqual(['a', 'b', 'c', 'd', 'e 2.5 mg']);
  });
});

describe('calendar', () => {
  it('does date arithmetic on calendar days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(nextWeekday('2026-10-20', 2)).toBe('2026-10-27');
  });

  it('converts a wall-clock time in the family timezone to UTC across DST', () => {
    // Lisbon is UTC+1 until 25 October 2026, then UTC+0.
    expect(zonedTimeToUtc('2026-10-20', '20:00', 'Europe/Lisbon')).toBe('2026-10-20T19:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-26', '20:00', 'Europe/Lisbon')).toBe('2026-10-26T20:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-02', '18:00', 'Europe/Bucharest')).toBe(
      '2026-11-02T16:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-11-02', '18:00', 'UTC')).toBe('2026-11-02T18:00:00.000Z');
  });
});
