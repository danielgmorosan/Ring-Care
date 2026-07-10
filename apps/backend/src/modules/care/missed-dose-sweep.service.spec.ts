import type { AppConfig } from '../../config/env.validation';
import type { NewAlert } from '../escalation/alert.repository';
import type { AlertsService } from '../escalation/alerts.service';
import type { FamiliesService } from '../families/families.service';
import { InMemoryDoseConfirmationRepository } from './in-memory-dose-confirmation.repository';
import { InMemoryMedicationRepository } from './in-memory-medication.repository';
import { MissedDoseSweepService } from './missed-dose-sweep.service';

const FAMILY = 'fam-1';
// 10:00 UTC — past the 08:00 slot + 60-min window in UTC.
const PAST_DUE_UTC = Date.parse('2026-07-10T10:00:00.000Z');
// 08:30 UTC — before the 08:00 slot + 60-min window.
const NOT_YET_DUE_UTC = Date.parse('2026-07-10T08:30:00.000Z');

describe('MissedDoseSweepService', () => {
  let service: MissedDoseSweepService;
  let meds: InMemoryMedicationRepository;
  let doses: InMemoryDoseConfirmationRepository;
  let raised: NewAlert[];
  let timezone: string;
  let medId: string;

  beforeEach(async () => {
    meds = new InMemoryMedicationRepository();
    doses = new InMemoryDoseConfirmationRepository();
    raised = [];
    timezone = 'UTC';
    const families = {
      findAll: async () => [{ id: FAMILY, name: 'Silva', timezone, createdAt: '' }],
    } as unknown as FamiliesService;
    const alerts = {
      raise: async (alert: NewAlert) => {
        raised.push(alert);
      },
      alreadyRaised: async (ref: string, kind: string) =>
        raised.some((a) => a.ref === ref && a.kind === kind),
    } as unknown as AlertsService;
    const config = { missedDoseWindowMinutes: 60 } as unknown as AppConfig;
    service = new MissedDoseSweepService(families, alerts, config, meds, doses);
    const med = await meds.create({
      familyId: FAMILY,
      name: 'Bisoprolol',
      dosage: '5mg',
      times: ['08:00'],
      notes: null,
    });
    medId = med.id;
  });

  it('alerts the family when a scheduled dose passed its window unconfirmed', async () => {
    await service.sweep(PAST_DUE_UTC);

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      familyId: FAMILY,
      deviceId: null,
      kind: 'missed_dose',
      message: 'The 08:00 dose of Bisoprolol has not been confirmed. Open the app to check in.',
      ref: `${medId}:08:00:2026-07-10`,
    });
  });

  it('does not alert when the dose was confirmed today', async () => {
    await doses.append({
      doseId: 'd1',
      medicationId: medId,
      familyId: FAMILY,
      slot: '08:00',
      confirmedAt: '2026-07-10T08:05:00.000Z',
    });

    await service.sweep(PAST_DUE_UTC);

    expect(raised).toHaveLength(0);
  });

  it('does not alert before the slot plus the window has passed', async () => {
    await service.sweep(NOT_YET_DUE_UTC);

    expect(raised).toHaveLength(0);
  });

  it('alerts only once for the same missed dose (dedup across sweeps)', async () => {
    await service.sweep(PAST_DUE_UTC);
    await service.sweep(PAST_DUE_UTC + 5 * 60 * 1000);

    expect(raised).toHaveLength(1);
  });

  it('uses the family timezone: the same instant is due in Tokyo but not in UTC', async () => {
    // 00:30 UTC is 09:30 in Tokyo (past 08:00 + 60m) but only 00:30 in UTC (not due).
    const instant = Date.parse('2026-07-10T00:30:00.000Z');

    timezone = 'UTC';
    await service.sweep(instant);
    expect(raised).toHaveLength(0);

    timezone = 'Asia/Tokyo';
    await service.sweep(instant);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.ref).toBe(`${medId}:08:00:2026-07-10`);
  });
});
