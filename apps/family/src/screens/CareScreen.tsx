import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  useAppointments,
  useCareToday,
  useCreateAppointment,
  useCreateMedication,
  useDeleteAppointment,
  useDeleteMedication,
  useDoses,
  useMedications,
  useUpdateAppointment,
  useUpdateMedication,
} from '../api/hooks';
import type { Appointment, Medication } from '../api/types';
import {
  Body,
  Button,
  Card,
  Caption,
  Field,
  IconBadge,
  PageHeader,
  Screen,
  SectionHeader,
  TextAction,
} from '../components/ui';
import { relativeTime } from '../incident-format';
import { color, font, radius, space, text } from '../theme/tokens';
import { CareProposals } from './CareProposals';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parse a "08:00, 20:00" field into HH:MM entries, dropping anything malformed. */
function parseTimes(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => HH_MM.test(t));
}

/** A readable appointment time, e.g. "Thu 9 Jul, 10:00". */
function formatAppt(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
/** An ISO instant split into the local date + time strings the form edits. */
function toDateTimeInputs(at: string): { date: string; time: string } {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * One medication: its schedule, plus what the elder actually took (F3.4). The confirmed-dose
 * history turns the schedule into adherence the caregiver can see at a glance.
 */
function MedicationCard({
  med,
  onEdit,
  onRemove,
}: {
  med: Medication;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const doses = useDoses(med.id);
  const recent = [...(doses.data ?? [])]
    .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
    .slice(0, 4);

  return (
    <Card style={{ gap: space[3] }}>
      <View style={st.rowHead}>
        <IconBadge icon="pill" tone="neutral" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.name}>{med.name}</Text>
          {med.dosage ? <Caption>{med.dosage}</Caption> : null}
        </View>
      </View>

      {med.times.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {med.times.map((t) => (
            <View key={t} style={st.timePill}>
              <Text style={st.timePillText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={st.taken}>
        <Text style={st.takenLabel}>RECENTLY TAKEN</Text>
        {doses.isLoading ? (
          <Caption>Loading…</Caption>
        ) : recent.length === 0 ? (
          <Caption>No doses confirmed yet.</Caption>
        ) : (
          recent.map((d) => (
            <Caption key={d.id}>
              {d.slot ? `${d.slot} dose` : 'Dose'} · {relativeTime(d.confirmedAt)}
            </Caption>
          ))
        )}
      </View>
      <View style={st.actions}>
        <TextAction label="Edit" onPress={onEdit} />
        <TextAction label="Remove" danger onPress={onRemove} />
      </View>
    </Card>
  );
}

/** The elder's daily care: today at a glance, the medication schedule, appointments. */
export function CareScreen() {
  const today = useCareToday();
  const medications = useMedications();
  const createMedication = useCreateMedication();
  const updateMedication = useUpdateMedication();
  const deleteMedication = useDeleteMedication();
  const appointments = useAppointments();
  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [times, setTimes] = useState('');
  const [medError, setMedError] = useState<string | null>(null);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [apptError, setApptError] = useState<string | null>(null);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);

  function resetMedForm() {
    setName('');
    setDosage('');
    setTimes('');
    setEditingMedId(null);
  }

  function startEditMed(m: Medication) {
    setName(m.name);
    setDosage(m.dosage ?? '');
    setTimes(m.times.join(', '));
    setEditingMedId(m.id);
    setMedError(null);
  }

  async function saveMedication() {
    setMedError(null);
    const body = {
      name: name.trim(),
      dosage: dosage.trim() || undefined,
      times: parseTimes(times),
    };
    try {
      if (editingMedId) {
        await updateMedication.mutateAsync({ id: editingMedId, body });
      } else {
        await createMedication.mutateAsync(body);
      }
      resetMedForm();
    } catch (e) {
      setMedError((e as Error).message);
    }
  }

  function resetApptForm() {
    setTitle('');
    setDate('');
    setTime('');
    setLocation('');
    setEditingApptId(null);
  }

  function startEditAppt(a: Appointment) {
    const { date: d, time: t } = toDateTimeInputs(a.at);
    setTitle(a.title);
    setDate(d);
    setTime(t);
    setLocation(a.location ?? '');
    setEditingApptId(a.id);
    setApptError(null);
  }

  async function saveAppointment() {
    setApptError(null);
    const at = new Date(`${date.trim()}T${time.trim()}`);
    if (Number.isNaN(at.getTime())) {
      setApptError('Enter a valid date (YYYY-MM-DD) and time (HH:MM).');
      return;
    }
    const body = {
      title: title.trim(),
      at: at.toISOString(),
      location: location.trim() || undefined,
    };
    try {
      if (editingApptId) {
        await updateAppointment.mutateAsync({ id: editingApptId, body });
      } else {
        await createAppointment.mutateAsync(body);
      }
      resetApptForm();
    } catch (e) {
      setApptError((e as Error).message);
    }
  }

  const todaysAppts = today.data?.appointments ?? [];
  const medCount = today.data?.medications.length ?? 0;

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <PageHeader title="Care" subtitle="The daily routine" />

        <CareProposals />

        <SectionHeader icon="calendar" label="Today" />
        <Card style={{ gap: space[3] }}>
          {todaysAppts.length === 0 ? (
            <Body muted>
              {medCount > 0
                ? 'Nothing on the calendar today. The usual medications are below.'
                : 'A calm day. Nothing scheduled yet.'}
            </Body>
          ) : (
            <View style={{ gap: space[2] }}>
              {todaysAppts.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', gap: space[2] }}>
                  <Text style={st.apptTime}>{formatAppt(a.at)}</Text>
                  <Body>{a.title}</Body>
                </View>
              ))}
            </View>
          )}
        </Card>

        <View style={{ gap: space[3] }}>
          <SectionHeader
            icon="pill"
            label="Medications"
            right={
              medications.data && medications.data.length > 0 ? (
                <Text style={st.count}>{medications.data.length}</Text>
              ) : null
            }
          />
          {medications.isLoading ? (
            <Card>
              <Body muted>Loading medications.</Body>
            </Card>
          ) : medications.isError ? (
            <Card style={{ gap: space[3] }}>
              <Body muted>We couldn&apos;t load medications just now.</Body>
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => void medications.refetch()}
                loading={medications.isFetching}
              />
            </Card>
          ) : null}
          {(medications.data ?? []).map((m) => (
            <MedicationCard
              key={m.id}
              med={m}
              onEdit={() => startEditMed(m)}
              onRemove={() => void deleteMedication.mutate(m.id)}
            />
          ))}
          {medications.data?.length === 0 ? (
            <Card>
              <Body muted>No medications yet. Add what they take and when.</Body>
            </Card>
          ) : null}

          <Card style={{ gap: space[4] }}>
            <SectionHeader
              icon={editingMedId ? 'pencil' : 'plus'}
              label={editingMedId ? 'Edit medication' : 'Add a medication'}
            />
            <Field
              label="Name"
              placeholder="Bisoprolol"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Field label="Dose" placeholder="5mg" value={dosage} onChangeText={setDosage} />
            <Field
              label="Times"
              placeholder="08:00, 20:00"
              value={times}
              onChangeText={setTimes}
              hint="When to take it, 24-hour, separated by commas."
            />
            <Button
              label={editingMedId ? 'Save changes' : 'Add to schedule'}
              onPress={saveMedication}
              loading={createMedication.isPending || updateMedication.isPending}
              disabled={name.trim().length === 0}
            />
            {editingMedId ? <Button label="Cancel" variant="ghost" onPress={resetMedForm} /> : null}
            {medError ? <Caption>{`Could not save: ${medError}`}</Caption> : null}
          </Card>
        </View>

        <View style={{ gap: space[3] }}>
          <SectionHeader icon="stethoscope" label="Appointments" />
          {(appointments.data ?? []).map((a: Appointment) => (
            <Card key={a.id} style={{ gap: space[2] }}>
              <View style={st.rowHead}>
                <IconBadge icon="calendar" tone="info" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.name}>{a.title}</Text>
                  <Caption>{`${formatAppt(a.at)}${a.location ? ` · ${a.location}` : ''}`}</Caption>
                </View>
              </View>
              <View style={st.actions}>
                <TextAction label="Edit" onPress={() => startEditAppt(a)} />
                <TextAction
                  label="Remove"
                  danger
                  onPress={() => void deleteAppointment.mutate(a.id)}
                />
              </View>
            </Card>
          ))}
          {appointments.data?.length === 0 ? (
            <Card>
              <Body muted>No appointments yet.</Body>
            </Card>
          ) : null}

          <Card style={{ gap: space[4] }}>
            <SectionHeader
              icon={editingApptId ? 'pencil' : 'plus'}
              label={editingApptId ? 'Edit appointment' : 'Add an appointment'}
            />
            <Field
              label="What"
              placeholder="Dr. Almeida, cardiology"
              value={title}
              onChangeText={setTitle}
            />
            <Field
              label="Date"
              placeholder="2026-07-09"
              value={date}
              onChangeText={setDate}
              hint="Year-month-day, e.g. 2026-07-09."
            />
            <Field label="Time" placeholder="10:00" value={time} onChangeText={setTime} />
            <Field label="Where" placeholder="Clinic" value={location} onChangeText={setLocation} />
            <Button
              label={editingApptId ? 'Save changes' : 'Add appointment'}
              onPress={saveAppointment}
              loading={createAppointment.isPending || updateAppointment.isPending}
              disabled={
                title.trim().length === 0 || date.trim().length === 0 || !HH_MM.test(time.trim())
              }
            />
            {editingApptId ? (
              <Button label="Cancel" variant="ghost" onPress={resetApptForm} />
            ) : null}
            {apptError ? <Caption>{`Could not save: ${apptError}`}</Caption> : null}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  name: { ...font.semibold, fontSize: 17, color: color.textPrimary },
  count: { ...font.semibold, fontSize: text.sm, color: color.textPrimary },
  timePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.bgSunken,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  timePillText: {
    ...font.semibold,
    fontSize: 13,
    color: color.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  taken: {
    gap: 4,
    backgroundColor: color.bgCanvas,
    borderRadius: radius.sm,
    padding: space[3],
  },
  takenLabel: { ...font.semibold, fontSize: 11, letterSpacing: 1.1, color: color.textTertiary },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space[4],
    marginBottom: -space[2],
  },
  apptTime: { ...font.semibold, fontSize: text.md, color: color.textPrimary, minWidth: 120 },
});
