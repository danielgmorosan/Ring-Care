import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import {
  ACK_RESOLVE_WINDOW_SECONDS,
  ACK_SIGNAL,
  CAREGIVER_ACK_SIGNAL,
  CHECKIN_SIGNAL,
  CHECKIN_WAIT_SECONDS,
  DEFAULT_ESCALATION_RULES,
  RESOLVE_SIGNAL,
  escalationRulesFor,
  shouldSkipForQuietHours,
  type EscalationActivities,
  type EscalationInput,
  type EscalationResult,
  type IncidentStepKind,
  type VoiceCheckinResult,
} from './types';

/**
 * The deterministic safety core. This is a rules-based state machine, not an AI —
 * every branch is explainable and testable, and it never hallucinates. LLM/VLM
 * outputs may arrive as the check-in signal, but only these rules decide whether
 * help is summoned. Temporal makes it durable: a crash mid-escalation resumes
 * exactly where it left off.
 *
 * One ladder, reason-specific rules (escalationRulesFor): a fall runs the voice check-in
 * gate and ends at emergency services; a family-only reason (Ring night door activity,
 * decision 0011) skips the check-in and never reaches the emergency step.
 */

const acts = proxyActivities<EscalationActivities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 5 },
});

export const checkinSignal = defineSignal<[VoiceCheckinResult]>(CHECKIN_SIGNAL);
export const ackSignal = defineSignal<[string]>(ACK_SIGNAL);
export const caregiverAckSignal = defineSignal<[string]>(CAREGIVER_ACK_SIGNAL);
export const resolveSignal = defineSignal(RESOLVE_SIGNAL);

export async function escalationWorkflow(input: EscalationInput): Promise<EscalationResult> {
  let seq = 0;
  let checkin: VoiceCheckinResult = input.initialCheckin;
  let acknowledgedBy: string | null = null;
  // A caregiver acknowledged from the app (provisional, needs an all-clear within the window).
  let caregiverAckBy: string | null = null;
  let resolved = false;

  setHandler(checkinSignal, (result) => {
    if (checkin === 'pending') checkin = result;
  });
  setHandler(ackSignal, (contactId) => {
    if (!acknowledgedBy) acknowledgedBy = contactId;
  });
  setHandler(caregiverAckSignal, (who) => {
    if (!caregiverAckBy) caregiverAckBy = who;
  });
  setHandler(resolveSignal, () => {
    resolved = true;
  });

  const step = (
    kind: IncidentStepKind,
    contactId: string | null = null,
    detail: Record<string, unknown> = {},
  ): Promise<void> =>
    acts.recordStep({ incidentId: input.incidentId, seq: seq++, kind, contactId, detail });

  const rules = escalationRulesFor(input.reason);

  await step('incident_opened', null, {
    reason: input.reason,
    confirmedFall: input.confirmedFall,
    // Only non-default rule sets are spelled out, so the fall trail is unchanged.
    ...(rules === DEFAULT_ESCALATION_RULES
      ? {}
      : { voiceCheckin: rules.voiceCheckin, emergencyServices: rules.emergencyServices }),
  });

  // Voice check-in gate — the single biggest false-alarm killer. Wait a bounded
  // time for a result; no response is treated as silence, which escalates.
  // Falls only: a family-only reason has no one to ask "are you okay?" and goes straight on.
  if (rules.voiceCheckin) {
    if (checkin === 'pending') {
      await condition(() => checkin !== 'pending', `${CHECKIN_WAIT_SECONDS}s`);
      if (checkin === 'pending') checkin = 'silence';
    }
    await step('voice_checkin_result', null, { result: checkin });

    if (checkin === 'i_am_fine') {
      await step('stood_down', null, { reason: 'voice_checkin_ok' });
      return { outcome: 'stood_down', acknowledgedByContactId: null, steps: seq };
    }
  }

  // Distress or silence → this is real. Alarm the caregivers' own devices first:
  // a critical push is the primary, immediate way to get attention, ahead of the
  // phone-call ladder. Sent only now (not at incident open) so the check-in still
  // gates false alarms.
  const deviceMessage =
    input.messages?.device ??
    `Obrigada needs you: a possible ${input.reason.replace(/[._]/g, ' ')} at home.`;
  for (const token of input.pushDevices) {
    await acts.pushDeviceAlert({ incidentId: input.incidentId, token, message: deviceMessage });
    await step('push_sent', null, { device: true });
  }

  // Then run the contact ladder in priority order.
  const nowMinutesUtc = (): number => {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  };

  for (const contact of input.contacts) {
    // A contact answering, or a caregiver acknowledging from the app, stops the phone tree.
    if (acknowledgedBy || caregiverAckBy) break;
    if (shouldSkipForQuietHours(
        contact,
        input.confirmedFall || rules.wakesThroughQuietHours,
        nowMinutesUtc(),
      )) {
      await step('quiet_hours_skipped', contact.id, {});
      continue;
    }
    await step('call_placed', contact.id, { phone: contact.phone });
    const { answered } = await acts.placeCall({
      incidentId: input.incidentId,
      contact,
      ringSeconds: input.ackWindowSeconds,
    });
    if (answered) {
      acknowledgedBy = contact.id;
      await step('call_answered', contact.id, {});
      break;
    }
    await step('call_no_answer', contact.id, {});
  }

  // A contact answered a call — an attentive human is engaged. Full stop (existing behavior).
  if (acknowledgedBy) {
    return { outcome: 'acknowledged', acknowledgedByContactId: acknowledgedBy, steps: seq };
  }

  // A caregiver acknowledged from the app (0008). This is provisional: a one-tap action, not
  // the attentive act of answering a call, so it only holds escalation for a bounded window.
  // They must send an all-clear in time, or the acknowledgement lapses and the ladder resumes
  // — a mis-tap or a distracted caregiver can only ever delay help, never suppress it.
  if (caregiverAckBy) {
    await step('caregiver_acknowledged', null, { by: caregiverAckBy });
    const clearedInTime = await condition(() => resolved, `${ACK_RESOLVE_WINDOW_SECONDS}s`);
    if (clearedInTime) {
      await step('stood_down', null, { reason: 'caregiver_all_clear' });
      return { outcome: 'stood_down', acknowledgedByContactId: caregiverAckBy, steps: seq };
    }
    await step('acknowledgement_lapsed', null, { by: caregiverAckBy });
    // Fall through to the full "nobody handled it" escalation below.
  }

  // Nobody reachable (or an acknowledgement lapsed) → SMS + critical push to the whole chain,
  // then emergency (when the rule set allows it).
  const message =
    input.messages?.unanswered ??
    `Obrigada needs you: a possible ${input.reason.replace(/[._]/g, ' ')} at home has gone unanswered.`;
  for (const contact of input.contacts) {
    if (contact.phone) {
      await acts.sendSms({ incidentId: input.incidentId, contact, message });
      await step('sms_sent', contact.id, {});
    }
    if (contact.pushToken) {
      await acts.pushCriticalAlert({ incidentId: input.incidentId, contact, message });
      await step('push_sent', contact.id, {});
    }
  }

  // Family-only rule set (decision 0011): everyone on the chain now has it by text and push.
  // Emergency services are never dispatched for this reason; the ladder ends here.
  if (!rules.emergencyServices) {
    await step('family_alerted', null, { emergencyServices: false });
    return { outcome: 'family_alerted', acknowledgedByContactId: null, steps: seq };
  }

  await acts.notifyEmergency({ incidentId: input.incidentId, summary: input.reason });
  await step('emergency_notified', null, {});
  return { outcome: 'emergency_notified', acknowledgedByContactId: null, steps: seq };
}
