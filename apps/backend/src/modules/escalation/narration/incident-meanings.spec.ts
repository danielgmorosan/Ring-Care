import { forModel, incidentForModel, outcomeMeaning, reasonMeaning } from './incident-meanings';

describe('incident meanings for the model', () => {
  it('describes a Ring night door event without implying who it was', () => {
    expect(reasonMeaning('door.night_activity')).toContain('cannot tell who');
    expect(outcomeMeaning('acknowledged')).toContain('handling it');
  });

  it('replaces raw labels with words and local time', () => {
    const view = incidentForModel({
      reason: 'door.night_activity',
      outcome: 'acknowledged',
      at: '2026-10-23T02:04:49.000Z',
      localTime: '3:04',
      meaning: reasonMeaning('door.night_activity'),
      outcomeMeaning: outcomeMeaning('acknowledged'),
    });
    expect(view).toEqual({
      date: '2026-10-23',
      time: '3:04',
      what: reasonMeaning('door.night_activity'),
      outcome: outcomeMeaning('acknowledged'),
    });
    expect(JSON.stringify(view)).not.toContain('night_activity');
  });

  it('maps both day-summary and Q&A request shapes and leaves others alone', () => {
    const inc = { reason: 'x', outcome: 'y', at: '2026-10-23T00:00:00.000Z' };
    expect(forModel({ date: 'd', incidents: [inc] }).incidents[0]).toEqual({
      date: '2026-10-23',
      time: '2026-10-23T00:00:00.000Z',
      what: 'x',
      outcome: 'y',
    });
    const qa = forModel({ question: 'q', context: { incidents: [inc], timezone: 'UTC' } });
    expect(qa.context.incidents[0]).toHaveProperty('what', 'x');
    expect(forModel({ reason: 'r' })).toEqual({ reason: 'r' });
  });
});
