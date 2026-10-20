import { z } from 'zod';

/** Response shapes from the Obrigada backend, validated on the client. */

/** The elder-facing voice check-in language. A safety setting; must match the elder. */
export const checkinLanguageSchema = z.enum(['en', 'pt-PT']);
export type CheckinLanguage = z.infer<typeof checkinLanguageSchema>;

export const familySchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  checkinLanguage: checkinLanguageSchema,
  createdAt: z.string(),
});
export type Family = z.infer<typeof familySchema>;

export const deviceStatusSchema = z.enum(['registered', 'provisioning', 'online', 'offline']);
export const deviceSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  registeredAt: z.string(),
});
export type Device = z.infer<typeof deviceSchema>;

export const quietHoursSchema = z.object({
  start: z.string(),
  end: z.string(),
  wakeForConfirmedFallOnly: z.boolean(),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  phone: z.string().nullable(),
  pushToken: z.string().nullable(),
  priority: z.number(),
  quietHours: quietHoursSchema.nullable(),
});
export type Contact = z.infer<typeof contactSchema>;

export const contactListSchema = z.array(contactSchema);
export const deviceListSchema = z.array(deviceSchema);

/** A one-time pairing code for a guardian phone (F2.6). */
export const claimCodeSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
});
export type ClaimCode = z.infer<typeof claimCodeSchema>;

/** The answer from the family Q&A agent (F3.3). */
export const askAnswerSchema = z.object({ answer: z.string() });
export type AskAnswer = z.infer<typeof askAnswerSchema>;

/** A minted LiveKit grant to open a guardian's live camera (F2.5). View-only, short-lived;
 * the stream is E2EE between the devices and the backend never sees media. */
export const liveGrantSchema = z.object({
  url: z.string(),
  token: z.string(),
  room: z.string(),
  identity: z.string(),
  expiresInSeconds: z.number(),
});
export type LiveGrant = z.infer<typeof liveGrantSchema>;

/** One entry in the family activity history (rule #7). */
export const activityItemSchema = z.object({
  id: z.string(),
  at: z.string(),
  label: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;
export const activityListSchema = z.array(activityItemSchema);

/** A guardian's health in the family fleet view (F2.6). */
export const fleetGuardianSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: deviceStatusSchema,
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  batteryPct: z.number().nullable(),
  thermalC: z.number().nullable(),
  appVersion: z.string().nullable(),
});
export type FleetGuardian = z.infer<typeof fleetGuardianSchema>;
export const fleetListSchema = z.array(fleetGuardianSchema);

/** A safety zone drawn on a guardian's camera (F2.3): a hazard area or a doorway. */
export const zoneKindSchema = z.enum(['hazard', 'door']);
export type ZoneKind = z.infer<typeof zoneKindSchema>;
export const zoneSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  name: z.string(),
  kind: zoneKindSchema,
  active: z.boolean(),
  createdAt: z.string(),
});
export type Zone = z.infer<typeof zoneSchema>;
export const zoneListSchema = z.array(zoneSchema);

/** The incident trail (Timeline). Read-only, append-only on the server. */
export const incidentOutcomeSchema = z.enum([
  'active',
  'stood_down',
  'acknowledged',
  'emergency_notified',
  'family_alerted',
]);
export type IncidentOutcome = z.infer<typeof incidentOutcomeSchema>;

export const incidentSummarySchema = z.object({
  id: z.string(),
  reason: z.string(),
  openedAt: z.string(),
  outcome: incidentOutcomeSchema,
  stepCount: z.number(),
});
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;
export const incidentListSchema = z.array(incidentSummarySchema);

export const incidentStepSchema = z.object({
  seq: z.number(),
  // Left as a string, not an enum: new step kinds should render, not break the app.
  kind: z.string(),
  contactName: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  occurredAt: z.string().nullable(),
});
export type IncidentStep = z.infer<typeof incidentStepSchema>;

/** The on-device VLM's second opinion on the flag that opened an incident (F3.1). Labels
 * only — never imagery. It is one input among the rules; it never decided anything (rule #3). */
export const secondOpinionSchema = z.object({
  verdict: z.enum(['confirmed', 'refuted', 'uncertain']),
  onFloor: z.boolean().optional(),
  walkerNearby: z.boolean().optional(),
  doorOpen: z.boolean().optional(),
  note: z.string().optional(),
  confidence: z.number().nullable(),
  at: z.string(),
});
export type SecondOpinion = z.infer<typeof secondOpinionSchema>;

export const incidentDetailSchema = z.object({
  id: z.string(),
  reason: z.string(),
  openedAt: z.string(),
  outcome: incidentOutcomeSchema,
  // Warm, human-words summary of the incident (F3.2).
  narrative: z.string(),
  steps: z.array(incidentStepSchema),
  // The on-device VLM's read on the flag (F3.1), or null if it did not run.
  secondOpinion: secondOpinionSchema.nullable(),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

/** The calm "Today" recap (F3.2). */
export const dailySummarySchema = z.object({
  date: z.string(),
  text: z.string(),
  incidentCount: z.number(),
  guardiansTotal: z.number(),
  guardiansOnline: z.number(),
});
export type DailySummary = z.infer<typeof dailySummarySchema>;

/** Auth. The session is the signed-in caregiver and their family. */
export const sessionSchema = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  family: z.object({ id: z.string(), name: z.string() }),
});
export type Session = z.infer<typeof sessionSchema>;

export const authResultSchema = sessionSchema.extend({ token: z.string() });
export type AuthResult = z.infer<typeof authResultSchema>;

/** The elder's medication schedule (F3.4). */
export const medicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  dosage: z.string().nullable(),
  times: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Medication = z.infer<typeof medicationSchema>;
export const medicationListSchema = z.array(medicationSchema);

/** A confirmed dose (F3.4): the elder took a scheduled medication. Append-only on the server. */
export const doseConfirmationSchema = z.object({
  id: z.string(),
  medicationId: z.string(),
  // The "HH:MM" schedule slot this confirms, or null if taken off-schedule.
  slot: z.string().nullable(),
  confirmedAt: z.string(),
});
export type DoseConfirmation = z.infer<typeof doseConfirmationSchema>;
export const doseListSchema = z.array(doseConfirmationSchema);

/** The elder's appointment calendar (F3.4). */
export const appointmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  at: z.string(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;
export const appointmentListSchema = z.array(appointmentSchema);

/** The combined "Today" care view. */
export const careTodaySchema = z.object({
  date: z.string(),
  medications: medicationListSchema,
  appointments: appointmentListSchema,
});
export type CareToday = z.infer<typeof careTodaySchema>;

/** Request bodies. */
export interface CreateFamilyBody {
  name: string;
}
export interface UpdateFamilyBody {
  name?: string;
  timezone?: string;
  checkinLanguage?: CheckinLanguage;
}
export interface CreateMedicationBody {
  name: string;
  dosage?: string;
  times?: string[];
  notes?: string;
}
export interface CreateAppointmentBody {
  title: string;
  at: string;
  location?: string;
  notes?: string;
}
export interface UpdateMedicationBody {
  name?: string;
  dosage?: string;
  times?: string[];
  notes?: string;
}
export interface UpdateAppointmentBody {
  title?: string;
  at?: string;
  location?: string;
  notes?: string;
}
export interface RegisterDeviceBody {
  familyId: string;
  name: string;
}
export interface CreateContactBody {
  name: string;
  role: string;
  phone?: string;
  priority: number;
  quietHours?: QuietHours;
}
export interface UpdateContactBody {
  name?: string;
  role?: string;
  phone?: string;
  priority?: number;
  quietHours?: QuietHours | null;
}

/** A family-facing alert (F2 coverage): stranger, hazard zone, unusual-hour door,
 * wander, or a missed medication dose. The unified /me/alerts feed. */
export const alertKindSchema = z.enum([
  'stranger',
  'hazard_zone',
  'door_unusual_hour',
  'wander',
  'missed_dose',
  'door.night_activity',
  'visit.no_show',
]);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const alertSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  deviceId: z.string().nullable(),
  // Known kinds get their own label; an unknown kind from a newer backend still renders.
  kind: alertKindSchema.or(z.string()),
  message: z.string(),
  ref: z.string(),
  at: z.string(),
  createdAt: z.string(),
});
export type Alert = z.infer<typeof alertSchema>;
export const alertListSchema = z.array(alertSchema);

/** An enrolled household member (F2.2): who belongs, and their role. Biometrics stay
 * on the device; the app manages only the title and role. */
export const householdRoleSchema = z.enum(['resident', 'family', 'caregiver', 'friend', 'other']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const personSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string(),
  role: householdRoleSchema,
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type Person = z.infer<typeof personSchema>;
export const personListSchema = z.array(personSchema);

export interface CreatePersonBody {
  title: string;
  role: HouseholdRole;
  notes?: string;
}

/** A stranger/uniform decision (F2.4): a guardian saw an unknown person and the rule
 * judged whether they were expected. The fuller record behind the stranger alerts. */
export const sightingSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  deviceId: z.string(),
  eventId: z.string(),
  at: z.string(),
  uniformed: z.boolean(),
  decision: z.enum(['expected', 'stranger']),
  reason: z.enum(['system_emergency', 'expected_visit', 'none']),
  visitLabel: z.string().nullable(),
  recordedAt: z.string(),
});
export type Sighting = z.infer<typeof sightingSchema>;
export const sightingListSchema = z.array(sightingSchema);

/** A pre-logged expected visit (F2.4): tell Obrigada a visitor is coming so they are
 * not flagged as a stranger. The trusted-context side of "uniforms are never trust". */
export const visitSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  visitorLabel: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Visit = z.infer<typeof visitSchema>;
export const visitListSchema = z.array(visitSchema);

export interface CreateVisitBody {
  visitorLabel: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
}

/** Ring (decision 0011). Metadata only: labels, ids and times. Ring video stays in the
 * family's Ring account; Obrigada never downloads or stores it (rule #1). */
export const ringModeSchema = z.enum(['oauth', 'playground', 'off']);
export type RingMode = z.infer<typeof ringModeSchema>;

export const ringPlacementSchema = z.enum(['front_door', 'indoor', 'other']);
export type RingPlacement = z.infer<typeof ringPlacementSchema>;

export const ringCameraSchema = z.object({
  id: z.string(),
  ringDeviceId: z.string(),
  name: z.string(),
  placement: ringPlacementSchema,
  online: z.boolean(),
  lastEventAt: z.string().nullable(),
});
export type RingCamera = z.infer<typeof ringCameraSchema>;
export const ringCameraListSchema = z.array(ringCameraSchema);

export const ringStatusSchema = z.object({
  mode: ringModeSchema,
  webhooks: z.boolean(),
  cameras: ringCameraListSchema,
});
export type RingStatus = z.infer<typeof ringStatusSchema>;

export const ringActivitySchema = z.object({
  id: z.string(),
  cameraId: z.string(),
  cameraName: z.string(),
  placement: ringPlacementSchema,
  kind: z.enum(['motion', 'ding', 'online', 'offline']),
  // Ring's Smart Alert label, e.g. "human". Left as a string so new labels still render.
  subType: z.string().nullable(),
  occurredAt: z.string(),
  source: z.enum(['ring', 'simulator']),
  // How the care rules read this event, if at all. One input among the rules (rule #3).
  interpretation: z.enum(['night_door', 'visit_arrival']).nullable(),
});
export type RingActivity = z.infer<typeof ringActivitySchema>;
export const ringActivityListSchema = z.array(ringActivitySchema);

/** A Ring live view session: the backend relays WHEP signalling only, never media. */
export const ringLiveSessionSchema = z.object({
  sessionId: z.string(),
  sdpAnswer: z.string(),
});
export type RingLiveSession = z.infer<typeof ringLiveSessionSchema>;

/** Care proposals from the caregiver's Bee voice notes (decision 0012). Suggestions only:
 * nothing changes the care plan until the caregiver approves it. */
export const proposalItemKindSchema = z.enum([
  'medication_change',
  'new_medication',
  'appointment',
  'todo',
  'note',
]);
export type ProposalItemKind = z.infer<typeof proposalItemKindSchema>;

export const proposalItemSchema = z.object({
  id: z.string(),
  kind: proposalItemKindSchema,
  title: z.string(),
  detail: z.string().nullable().optional(),
  data: z.unknown().optional(),
});
export type ProposalItem = z.infer<typeof proposalItemSchema>;

export const proposalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const careProposalSchema = z.object({
  id: z.string(),
  source: z.literal('bee'),
  createdAt: z.string(),
  summary: z.string().nullable().optional(),
  status: proposalStatusSchema,
  items: z.array(proposalItemSchema),
});
export type CareProposal = z.infer<typeof careProposalSchema>;
export const careProposalListSchema = z.array(careProposalSchema);

export const approveResultSchema = z.object({
  applied: z.array(z.string()),
  todosCreated: z.number(),
});
export type ApproveResult = z.infer<typeof approveResultSchema>;
