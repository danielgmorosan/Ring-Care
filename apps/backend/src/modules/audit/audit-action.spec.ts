import { actionLabel, deriveAction } from './audit-action';

describe('audit action mapping', () => {
  it('derives stable action slugs from method + route', () => {
    expect(deriveAction('POST', '/me/medications')).toBe('medications.create');
    expect(deriveAction('DELETE', '/me/medications/:medicationId')).toBe('medications.delete');
    expect(deriveAction('PATCH', '/me/contacts/:contactId')).toBe('contacts.update');
    expect(deriveAction('POST', '/me/devices')).toBe('devices.create');
    // The pairing sub-route is special-cased.
    expect(deriveAction('POST', '/me/devices/:deviceId/claim-code')).toBe('device.pair');
    // So is remote wipe — otherwise it would read as a generic "fleet" action.
    expect(deriveAction('POST', '/me/fleet/:deviceId/wipe')).toBe('device.wipe');
    // Bee care-proposal decisions (decision 0012).
    expect(deriveAction('POST', '/me/care/proposals/:proposalId/approve')).toBe(
      'care-proposal.approve',
    );
    expect(deriveAction('POST', '/me/care/proposals/:proposalId/reject')).toBe(
      'care-proposal.reject',
    );
    expect(actionLabel('care-proposal.approve')).toBe('Approved care changes from a Bee note');
  });

  it('maps actions to warm, human labels', () => {
    expect(actionLabel('medications.create')).toBe('Added a medication');
    expect(actionLabel('contacts.delete')).toBe('Removed a contact');
    expect(actionLabel('device.pair')).toBe('Started pairing a guardian');
    expect(actionLabel('device.wipe')).toBe('Wiped a guardian remotely');
    // Unknown actions fall back to a readable default, never a raw slug.
    expect(actionLabel('appointments.create')).toBe('Added an appointment');
    expect(actionLabel('widgets.update')).toBe('Updated a widgets');
  });
});
