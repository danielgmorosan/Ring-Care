import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import {
  activityListSchema,
  alertListSchema,
  personListSchema,
  sightingListSchema,
  visitListSchema,
  visitSchema,
  visitArrivalListSchema,
  personSchema,
  askAnswerSchema,
  claimCodeSchema,
  contactListSchema,
  dailySummarySchema,
  deviceListSchema,
  deviceSchema,
  familySchema,
  fleetListSchema,
  appointmentListSchema,
  appointmentSchema,
  careTodaySchema,
  incidentDetailSchema,
  incidentListSchema,
  liveGrantSchema,
  medicationListSchema,
  medicationSchema,
  doseListSchema,
  zoneListSchema,
  zoneSchema,
  approveResultSchema,
  careProposalListSchema,
  ringActivityListSchema,
  ringCameraListSchema,
  ringLiveSessionSchema,
  ringStatusSchema,
  type ActivityItem,
  type ApproveResult,
  type CareProposal,
  type ProposalStatus,
  type RingActivity,
  type RingCamera,
  type RingLiveSession,
  type RingPlacement,
  type RingStatus,
  type Alert,
  type CreatePersonBody,
  type Person,
  type Sighting,
  type CreateVisitBody,
  type Visit,
  type VisitArrival,
  type Appointment,
  type AskAnswer,
  type CareToday,
  type ClaimCode,
  type Contact,
  type LiveGrant,
  type CreateAppointmentBody,
  type CreateContactBody,
  type CreateMedicationBody,
  type Family,
  type UpdateFamilyBody,
  type UpdateAppointmentBody,
  type UpdateMedicationBody,
  type DailySummary,
  type Device,
  type DoseConfirmation,
  type FleetGuardian,
  type IncidentDetail,
  type IncidentSummary,
  type Medication,
  type UpdateContactBody,
  type Zone,
} from './types';

/** Register a guardian for the signed-in caregiver's family (family from the token). */
export function useRegisterDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string): Promise<Device> =>
      api('/me/devices', { method: 'POST', body: { name }, schema: deviceSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['devices'] });
      void qc.invalidateQueries({ queryKey: ['fleet'] });
    },
  });
}

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: (): Promise<Device[]> => api('/me/devices', { schema: deviceListSchema }),
  });
}

/** Per-guardian health (status, last seen, battery, app version). Polls so a
 * guardian coming online or going quiet is reflected without a manual refresh. */
export function useFleet() {
  return useQuery({
    queryKey: ['fleet'],
    queryFn: (): Promise<FleetGuardian[]> => api('/me/fleet', { schema: fleetListSchema }),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

/** Ask the backend for a fresh one-time pairing code for a guardian. */
export function useIssueClaimCode() {
  return useMutation({
    mutationFn: (deviceId: string): Promise<ClaimCode> =>
      api(`/me/devices/${deviceId}/claim-code`, { method: 'POST', schema: claimCodeSchema }),
  });
}

/** Open a live view of a guardian: mints a short-lived, view-only LiveKit token (F2.5).
 * Each open is audit-logged server-side (rule #7). */
export function useLiveToken() {
  return useMutation({
    mutationFn: (deviceId: string): Promise<LiveGrant> =>
      api(`/me/live/${deviceId}/token`, { method: 'POST', schema: liveGrantSchema }),
  });
}

/** Decommission a guardian (F2.6): the backend queues a wipe for a lost or retired phone,
 * which clears its identity, enrolled faces, and queued events. Destructive; confirm first. */
export function useWipeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string): Promise<void> =>
      api(`/me/fleet/${deviceId}/wipe`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fleet'] }),
  });
}

/** The safety zones drawn on the family's guardians (F2.3). Drawn on the device (the camera
 * view never leaves it); listed and manageable here. */
export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: (): Promise<Zone[]> => api('/me/zones', { schema: zoneListSchema }),
  });
}

export function useRenameZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }): Promise<Zone> =>
      api(`/me/zones/${id}`, { method: 'PATCH', body: { name }, schema: zoneSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/zones/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useDailySummary() {
  return useQuery({
    queryKey: ['summary', 'today'],
    queryFn: (): Promise<DailySummary> => api('/me/summary/today', { schema: dailySummarySchema }),
  });
}

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: (): Promise<IncidentSummary[]> => api('/me/incidents', { schema: incidentListSchema }),
    // A new incident (or one resolving) should appear without a manual refresh.
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}

/** A caregiver takes ownership of an active incident — "I'm handling this" (decision 0008).
 * Provisional: it holds escalation for a window, then resumes unless followed by useResolveIncident. */
export function useAcknowledgeIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      api(`/incidents/${id}/acknowledge`, { method: 'POST' }),
    onSuccess: (_data, id) => void qc.invalidateQueries({ queryKey: ['incidents', id] }),
  });
}

/** A caregiver's "All clear" that resolves an acknowledged incident (decision 0008). */
export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/incidents/${id}/resolve`, { method: 'POST' }),
    onSuccess: (_data, id) => void qc.invalidateQueries({ queryKey: ['incidents', id] }),
  });
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: ['incidents', id],
    enabled: id !== null,
    queryFn: (): Promise<IncidentDetail> =>
      api(`/me/incidents/${id}`, { schema: incidentDetailSchema }),
    // While the ladder is running, follow it step by step; stop once it has resolved.
    refetchInterval: (query) => (query.state.data?.outcome === 'active' ? 3000 : false),
    refetchIntervalInBackground: false,
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: (): Promise<Contact[]> => api('/me/contacts', { schema: contactListSchema }),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContactBody): Promise<Contact> =>
      api('/me/contacts', { method: 'POST', body, schema: contactListSchema.element }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContactBody }): Promise<Contact> =>
      api(`/me/contacts/${id}`, { method: 'PATCH', body, schema: contactListSchema.element }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useMedications() {
  return useQuery({
    queryKey: ['medications'],
    queryFn: (): Promise<Medication[]> => api('/me/medications', { schema: medicationListSchema }),
  });
}

/** The confirmed-dose history for one medication (F3.4): what the elder actually took. */
export function useDoses(medicationId: string) {
  return useQuery({
    queryKey: ['doses', medicationId],
    queryFn: (): Promise<DoseConfirmation[]> =>
      api(`/me/medications/${medicationId}/doses`, { schema: doseListSchema }),
  });
}

export function useCreateMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationBody): Promise<Medication> =>
      api('/me/medications', { method: 'POST', body, schema: medicationSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['medications'] }),
  });
}

export function useUpdateMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMedicationBody }): Promise<Medication> =>
      api(`/me/medications/${id}`, { method: 'PATCH', body, schema: medicationSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['medications'] }),
  });
}

export function useDeleteMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/medications/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['medications'] }),
  });
}

export function useAppointments() {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: (): Promise<Appointment[]> =>
      api('/me/appointments', { schema: appointmentListSchema }),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentBody): Promise<Appointment> =>
      api('/me/appointments', { method: 'POST', body, schema: appointmentSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['care', 'today'] });
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAppointmentBody }): Promise<Appointment> =>
      api(`/me/appointments/${id}`, { method: 'PATCH', body, schema: appointmentSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['care', 'today'] });
    },
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/appointments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['care', 'today'] });
    },
  });
}

export function useCareToday() {
  return useQuery({
    queryKey: ['care', 'today'],
    queryFn: (): Promise<CareToday> => api('/me/care/today', { schema: careTodaySchema }),
  });
}

/** The family activity history (rule #7). Polls so new actions appear on their own. */
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: (): Promise<ActivityItem[]> => api('/me/activity', { schema: activityListSchema }),
    refetchInterval: 8000,
  });
}

/** The household settings (name, timezone). Timezone drives what "today" means. */
export function useFamily() {
  return useQuery({
    queryKey: ['family'],
    queryFn: (): Promise<Family> => api('/me/family', { schema: familySchema }),
  });
}

/** Change household settings. Timezone changes shift the daily summary and care view. */
export function useUpdateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateFamilyBody): Promise<Family> =>
      api('/me/family', { method: 'PATCH', body, schema: familySchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['family'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void qc.invalidateQueries({ queryKey: ['care'] });
      void qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Ask Obrigada a question about the family, answered from the structured logs (F3.3). */
export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string): Promise<AskAnswer> =>
      api('/me/ask', { method: 'POST', body: { question }, schema: askAnswerSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activity'] }),
  });
}

/** The unified alert feed (F2 coverage): stranger, hazard zone, unusual-hour door,
 * wander, missed dose. Polls so a new alert appears without a manual refresh. */
export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: (): Promise<Alert[]> => api('/me/alerts', { schema: alertListSchema }),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
}

/** The enrolled household roster (F2.2): who belongs, and their role. */
export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: (): Promise<Person[]> => api('/me/people', { schema: personListSchema }),
  });
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonBody): Promise<Person> =>
      api('/me/people', { method: 'POST', body, schema: personSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/people/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

/** The stranger/uniform sighting history (F2.4): who a guardian has seen and how each
 * was judged (expected vs stranger). Polled so a new sighting appears on its own. */
export function useSightings() {
  return useQuery({
    queryKey: ['sightings'],
    queryFn: (): Promise<Sighting[]> => api('/me/sightings', { schema: sightingListSchema }),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
}

/** Pre-logged expected visits (F2.4): a nurse on Thursday, so they are not a stranger. */
export function useVisits() {
  return useQuery({
    queryKey: ['visits'],
    queryFn: (): Promise<Visit[]> => api('/me/visits', { schema: visitListSchema }),
  });
}

/** Expected visitors who arrived, newest first (GET /me/visits/arrivals). For the Timeline. */
export function useVisitArrivals() {
  return useQuery({
    queryKey: ['visits', 'arrivals'],
    queryFn: (): Promise<VisitArrival[]> =>
      api('/me/visits/arrivals', { schema: visitArrivalListSchema }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVisitBody): Promise<Visit> =>
      api('/me/visits', { method: 'POST', body, schema: visitSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['visits'] }),
  });
}

export function useDeleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => api(`/me/visits/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['visits'] }),
  });
}

/** Ring (decision 0011): link status, linked cameras, and whether webhooks are live. */
export function useRingStatus() {
  return useQuery({
    queryKey: ['ring', 'status'],
    queryFn: (): Promise<RingStatus> => api('/me/ring/status', { schema: ringStatusSchema }),
  });
}

export function useRingCameras() {
  return useQuery({
    queryKey: ['ring', 'cameras'],
    queryFn: (): Promise<RingCamera[]> => api('/me/ring/cameras', { schema: ringCameraListSchema }),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
}

/** Pull the linked Ring account's devices and upsert them as cameras. */
export function useSyncRingCameras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<void> => api('/me/ring/cameras/sync', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ring'] }),
  });
}

/** Where a camera sits. Night door alerts and visit arrivals read front-door cameras only. */
export function useSetRingPlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, placement }: { id: string; placement: RingPlacement }): Promise<void> =>
      api(`/me/ring/cameras/${id}`, { method: 'PATCH', body: { placement } }),
    onMutate: async ({ id, placement }) => {
      // Optimistic: the picker should move the moment it is tapped.
      await qc.cancelQueries({ queryKey: ['ring', 'cameras'] });
      const previous = qc.getQueryData<RingCamera[]>(['ring', 'cameras']);
      qc.setQueryData<RingCamera[]>(['ring', 'cameras'], (list) =>
        list?.map((c) => (c.id === id ? { ...c, placement } : c)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(['ring', 'cameras'], context.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['ring'] }),
  });
}

/** Recent Ring motion and doorbell events, with how the care rules read them. Polls so a
 * simulated or real event appears on its own. */
export function useRingActivity(limit = 50) {
  return useQuery({
    queryKey: ['ring', 'activity', limit],
    queryFn: (): Promise<RingActivity[]> =>
      api(`/me/ring/activity?limit=${limit}`, { schema: ringActivityListSchema }),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

/** Open a Ring live view: send our WHEP offer, get Ring's answer. The backend relays
 * signalling only (never media) and audit-logs every open (rule #7). Plain functions as
 * well as hooks, because the live view ties the session to a component's lifetime. */
export function startRingLive(cameraId: string, sdpOffer: string): Promise<RingLiveSession> {
  return api(`/me/ring/cameras/${cameraId}/live`, {
    method: 'POST',
    body: { sdpOffer },
    schema: ringLiveSessionSchema,
  });
}

export function stopRingLive(cameraId: string, sessionId: string): Promise<void> {
  return api(`/me/ring/cameras/${cameraId}/live/${sessionId}`, { method: 'DELETE' });
}

export function useStartRingLive() {
  return useMutation({
    mutationFn: ({ cameraId, sdpOffer }: { cameraId: string; sdpOffer: string }) =>
      startRingLive(cameraId, sdpOffer),
  });
}

export function useStopRingLive() {
  return useMutation({
    mutationFn: ({ cameraId, sessionId }: { cameraId: string; sessionId: string }) =>
      stopRingLive(cameraId, sessionId),
  });
}

/** Care proposals extracted from the caregiver's Bee voice notes (decision 0012). */
export function useCareProposals(status: ProposalStatus = 'pending') {
  return useQuery({
    queryKey: ['care', 'proposals', status],
    queryFn: (): Promise<CareProposal[]> =>
      api(`/me/care/proposals?status=${status}`, { schema: careProposalListSchema }),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}

/** Approve some or all items of a proposal. Approved items land in the care plan and as
 * Bee reminders on the caregiver's wrist. */
export function useApproveProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemIds }: { id: string; itemIds?: string[] }): Promise<ApproveResult> =>
      api(`/me/care/proposals/${id}/approve`, {
        method: 'POST',
        body: itemIds ? { itemIds } : {},
        schema: approveResultSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['care'] });
      void qc.invalidateQueries({ queryKey: ['medications'] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Set a proposal aside. Nothing in the care plan changes. */
export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      api(`/me/care/proposals/${id}/reject`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['care', 'proposals'] }),
  });
}
