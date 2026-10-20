import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAlerts, useCreateVisit, useDeleteVisit, useSightings, useVisits } from '../api/hooks';
import type { AlertKind, Sighting } from '../api/types';
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  Divider,
  Field,
  IconBadge,
  PageHeader,
  Screen,
  SectionHeader,
  TextAction,
  type IconName,
} from '../components/ui';
import { relativeTime } from '../incident-format';
import { color, font, radius, space } from '../theme/tokens';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Build an ISO instant from a local date + time (the caregiver's own timezone). */
function toInstant(date: string, time: string): string | null {
  if (!YMD.test(date) || !HH_MM.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A readable visit window, e.g. "Thu 9 Jul, 14:00–17:00". */
function formatWindow(startsAt: string, endsAt: string): string {
  const a = new Date(startsAt);
  const b = new Date(endsAt);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const day = a.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = (d: Date) =>
    d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${hm(a)}–${hm(b)}`;
}

type Tone = 'incident' | 'attention' | 'neutral' | 'well';

/** How each alert kind reads and how loud it looks. Stranger and wander are the two
 * that mean a person is where they should not be, so they carry the incident tone. */
const KIND: Record<AlertKind, { label: string; tone: Tone; icon: IconName }> = {
  stranger: { label: 'Stranger', tone: 'incident', icon: 'user' },
  wander: { label: 'Wandering', tone: 'incident', icon: 'footprints' },
  hazard_zone: { label: 'Hazard zone', tone: 'attention', icon: 'alert-triangle' },
  door_unusual_hour: { label: 'Door at an unusual hour', tone: 'attention', icon: 'door-open' },
  missed_dose: { label: 'Missed dose', tone: 'attention', icon: 'pill' },
  'door.night_activity': { label: 'Front door at night', tone: 'incident', icon: 'moon' },
  'visit.no_show': { label: 'Expected visit missed', tone: 'attention', icon: 'hourglass' },
};

/** How a sighting reads: expected (with why) or a stranger. */
function sightingChip(s: Sighting): { label: string; tone: Tone } {
  if (s.decision === 'stranger') {
    return { label: s.uniformed ? 'Stranger (uniformed)' : 'Stranger', tone: 'incident' };
  }
  if (s.reason === 'expected_visit') {
    return { label: s.visitLabel ? `Expected: ${s.visitLabel}` : 'Expected visit', tone: 'well' };
  }
  return { label: 'Expected: responder', tone: 'well' };
}

/** Everything Obrigada has told the family about, newest first. */
export function AlertsScreen() {
  const alerts = useAlerts();
  const sightings = useSightings();
  const visits = useVisits();
  const createVisit = useCreateVisit();
  const deleteVisit = useDeleteVisit();
  const list = alerts.data ?? [];
  const seen = sightings.data ?? [];

  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [visitError, setVisitError] = useState<string | null>(null);

  async function addVisit() {
    setVisitError(null);
    const startsAt = toInstant(date, from);
    const endsAt = toInstant(date, until);
    if (!startsAt || !endsAt) {
      setVisitError('Use a date (YYYY-MM-DD) and times (HH:MM).');
      return;
    }
    if (endsAt <= startsAt) {
      setVisitError('The end time must be after the start time.');
      return;
    }
    try {
      await createVisit.mutateAsync({ visitorLabel: label.trim(), startsAt, endsAt });
      setLabel('');
      setDate('');
      setFrom('');
      setUntil('');
    } catch (e) {
      setVisitError((e as Error).message);
    }
  }

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <PageHeader title="Alerts" subtitle={"What we've flagged"} />

        {alerts.isLoading ? (
          <Card>
            <Body muted>Loading alerts.</Body>
          </Card>
        ) : alerts.isError ? (
          <Card style={{ gap: space[3] }}>
            <Body muted>We couldn&apos;t load alerts just now.</Body>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void alerts.refetch()}
              loading={alerts.isFetching}
            />
          </Card>
        ) : list.length === 0 ? (
          <Card>
            <Body muted>
              Nothing to flag. When Obrigada sees a stranger, a hazard, a late-night door, or a
              missed dose, it shows up here.
            </Body>
          </Card>
        ) : (
          <View style={{ gap: space[3] }}>
            {list.map((alert) => {
              const kind = KIND[alert.kind as AlertKind] ?? {
                label: alert.kind.replace(/[._]/g, ' '),
                tone: 'attention' as const,
                icon: 'bell' as const,
              };
              return (
                <Card key={alert.id} style={s.alert}>
                  <View style={[s.alertBar, { backgroundColor: barColor[kind.tone] }]} />
                  <View style={s.head}>
                    <IconBadge icon={kind.icon} tone={kind.tone} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={s.title}>{kind.label}</Text>
                      <Caption>{relativeTime(alert.at)}</Caption>
                    </View>
                  </View>
                  <Body>{alert.message}</Body>
                </Card>
              );
            })}
          </View>
        )}

        {seen.length > 0 ? (
          <View style={{ gap: space[3] }}>
            <SectionHeader icon="scan-face" label="Who's been seen" />
            <Card style={{ paddingVertical: space[2] }}>
              {seen.map((sighting, i) => {
                const chip = sightingChip(sighting);
                return (
                  <View key={sighting.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={[s.head, { paddingVertical: space[3] }]}>
                      <Chip tone={chip.tone} dot>
                        {chip.label}
                      </Chip>
                      <View style={{ flex: 1 }} />
                      <Caption>{relativeTime(sighting.at)}</Caption>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ) : null}

        <Card style={{ gap: space[4] }}>
          <View style={{ gap: space[2] }}>
            <SectionHeader icon="calendar" label="Expecting someone?" />
            <Body muted>
              Log a visit and we won&apos;t flag them as a stranger while they&apos;re here. A
              uniform never counts as trust on its own.
            </Body>
          </View>
          {(visits.data ?? []).map((v) => (
            <View key={v.id} style={s.visitRow}>
              <IconBadge icon="user" tone="well" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.title}>{v.visitorLabel}</Text>
                <Caption>{formatWindow(v.startsAt, v.endsAt)}</Caption>
              </View>
              <TextAction label="Remove" danger onPress={() => void deleteVisit.mutate(v.id)} />
            </View>
          ))}
          <Field
            label="Who's coming"
            placeholder="Nurse"
            value={label}
            onChangeText={setLabel}
            autoCapitalize="words"
          />
          <Field
            label="Date"
            placeholder="2026-07-16"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
          <View style={s.timePair}>
            <View style={{ flex: 1 }}>
              <Field label="From" placeholder="14:00" value={from} onChangeText={setFrom} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Until" placeholder="17:00" value={until} onChangeText={setUntil} />
            </View>
          </View>
          <Button
            label="Log the visit"
            onPress={addVisit}
            loading={createVisit.isPending}
            disabled={label.trim().length === 0}
          />
          {visitError ? <Caption>{visitError}</Caption> : null}
        </Card>
      </View>
    </Screen>
  );
}

const barColor: Record<Tone, string> = {
  incident: color.incident500,
  attention: color.attention500,
  well: color.success,
  neutral: color.neutral200,
};

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  title: { ...font.semibold, fontSize: 17, lineHeight: 22, color: color.textPrimary },
  alert: { gap: space[3], overflow: 'hidden', paddingLeft: space[5] + 2 },
  alertBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: color.bgCanvas,
  },
  timePair: { flexDirection: 'row', gap: space[3] },
});
