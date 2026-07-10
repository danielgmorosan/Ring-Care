import type { IncidentRepository } from '../incident.repository';
import type { NotificationPort } from '../notifications/notification.port';
import type { EscalationActivities } from './types';

/**
 * Binds the workflow's activity interface to real implementations (append-only
 * incident store + outbound notifications). Activities run outside the workflow
 * sandbox and may do IO. Given the same input Temporal may retry them, so each is
 * idempotent (recordStep dedups on (incidentId, seq); notifications are at-least-once).
 */
export function createEscalationActivities(deps: {
  incidents: IncidentRepository;
  notifications: NotificationPort;
}): EscalationActivities {
  return {
    recordStep: (input) => deps.incidents.appendStep(input),
    placeCall: (input) => deps.notifications.placeCall(input),
    sendSms: (input) => deps.notifications.sendSms(input),
    pushCriticalAlert: (input) => deps.notifications.pushCriticalAlert(input),
    pushDeviceAlert: (input) => deps.notifications.pushDeviceAlert(input),
    notifyEmergency: (input) => deps.notifications.notifyEmergency(input),
  };
}
