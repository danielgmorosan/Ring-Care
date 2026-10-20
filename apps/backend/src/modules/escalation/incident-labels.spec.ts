import { incidentReasonLabel } from './incident-labels';

describe('incidentReasonLabel', () => {
  it('labels the Ring reasons in plain words', () => {
    expect(incidentReasonLabel('door.night_activity')).toBe('Front door at night');
    expect(incidentReasonLabel('visit.no_show')).toBe('Expected visit missed');
  });

  it('labels falls', () => {
    expect(incidentReasonLabel('fall.suspected')).toBe('Possible fall');
    expect(incidentReasonLabel('fall.confirmed')).toBe('Fall');
  });

  it('falls back to the reason itself so a new reason still renders', () => {
    expect(incidentReasonLabel('something.new')).toBe('something.new');
    expect(incidentReasonLabel('toString')).toBe('toString');
  });
});
