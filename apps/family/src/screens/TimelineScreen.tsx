import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIncidents, useVisitArrivals } from '../api/hooks';
import type { IncidentSummary, VisitArrival } from '../api/types';
import {
  Body,
  Button,
  Card,
  Caption,
  Chip,
  Icon,
  IconBadge,
  PageHeader,
  Screen,
} from '../components/ui';
import { color, font, radius, space, text } from '../theme/tokens';
import { outcomeLabel, reasonInfo, relativeTime, stepTime } from '../incident-format';

/** The left rail of the timeline: the clock time (or the date, for older entries) and a dot. */
function Rail({ at, last }: { at: string; last: boolean }) {
  const d = new Date(at);
  const today = d.toDateString() === new Date().toDateString();
  const label = today
    ? (stepTime(at) ?? '')
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <View style={st.railCol}>
      <Text style={st.railTime}>{label}</Text>
      <View style={st.railTrack}>
        <View style={st.railDot} />
        {last ? null : <View style={st.railLine} />}
      </View>
    </View>
  );
}
import { IncidentDetailScreen } from './IncidentDetailScreen';

function IncidentCard({ incident, onPress }: { incident: IncidentSummary; onPress: () => void }) {
  const outcome = outcomeLabel(incident.outcome);
  const reason = reasonInfo(incident.reason);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={reason.label}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}
    >
      <Card style={{ gap: space[3] }}>
        <View style={st.cardHead}>
          <IconBadge icon={reason.icon} tone={reason.tone} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.title}>{reason.label}</Text>
            <Caption>
              {`${relativeTime(incident.openedAt)} · ${incident.stepCount} step${
                incident.stepCount === 1 ? '' : 's'
              }`}
            </Caption>
          </View>
          <Icon name="chevron-right" size={20} color={color.textTertiary} />
        </View>
        <Chip tone={outcome.tone} dot>
          {outcome.label}
        </Chip>
      </Card>
    </Pressable>
  );
}

/** An expected visitor arrived. Informational: nothing to open, nothing to act on. */
function ArrivalCard({ arrival }: { arrival: VisitArrival }) {
  return (
    <Card style={{ gap: space[3], flex: 1 }}>
      <View style={st.cardHead}>
        <IconBadge icon="door-open" tone="well" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.title}>{arrival.text}</Text>
          <Caption>{`${relativeTime(arrival.arrivedAt)} · Seen by Ring at the front door`}</Caption>
        </View>
      </View>
      <Chip tone="well" dot>
        Arrived
      </Chip>
    </Card>
  );
}

type TimelineEntry =
  | { kind: 'incident'; at: string; incident: IncidentSummary }
  | { kind: 'arrival'; at: string; arrival: VisitArrival };

/** Incidents and arrivals in one list, newest first. */
function mergeTimeline(incidents: IncidentSummary[], arrivals: VisitArrival[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...incidents.map((incident) => ({
      kind: 'incident' as const,
      at: incident.openedAt,
      incident,
    })),
    ...arrivals.map((arrival) => ({ kind: 'arrival' as const, at: arrival.arrivedAt, arrival })),
  ];
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * The incident timeline. Lists incidents from the append-only trail; tapping one
 * opens the full step ladder in human words. The same record hospitals and
 * regulators read.
 */
export function TimelineScreen() {
  const incidents = useIncidents();
  // Arrivals are extra context: if they fail to load, the incident timeline still shows.
  const arrivals = useVisitArrivals();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId !== null) {
    return <IncidentDetailScreen id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const list = mergeTimeline(incidents.data ?? [], arrivals.data ?? []);

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <PageHeader title="Timeline" subtitle="Every step, in human words" />

        {incidents.isLoading ? (
          <Card>
            <Body muted>Loading your timeline.</Body>
          </Card>
        ) : incidents.isError ? (
          <Card style={{ gap: space[3] }}>
            <Body>We couldn&apos;t load the timeline just now.</Body>
            <Body muted>Your record is safe. Try again in a moment.</Body>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void incidents.refetch()}
              loading={incidents.isFetching}
            />
          </Card>
        ) : list.length === 0 ? (
          <Card style={{ gap: space[3] }}>
            <Body>Nothing to show yet.</Body>
            <Body muted>
              When something happens, every step we take will appear here in order: the fall, the
              voice check-in, the calls, and how it resolved. This is the same append-only record
              hospitals and regulators read.
            </Body>
          </Card>
        ) : (
          <View>
            {list.map((entry, i) => (
              <View
                key={
                  entry.kind === 'incident'
                    ? `incident-${entry.incident.id}`
                    : `arrival-${entry.arrival.id}`
                }
                style={st.entry}
              >
                <Rail at={entry.at} last={i === list.length - 1} />
                {entry.kind === 'incident' ? (
                  <IncidentCard
                    incident={entry.incident}
                    onPress={() => setSelectedId(entry.incident.id)}
                  />
                ) : (
                  <ArrivalCard arrival={entry.arrival} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  entry: { flexDirection: 'row', gap: space[3], paddingBottom: space[3] },
  railCol: { width: 64, flexDirection: 'row', gap: space[2] },
  railTime: {
    ...font.medium,
    flex: 1,
    textAlign: 'right',
    paddingTop: 20,
    fontSize: text.sm,
    color: color.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  railTrack: { width: 10, alignItems: 'center', paddingTop: 25 },
  railDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: color.neutral200 },
  railLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    marginBottom: -space[3] - 25,
    backgroundColor: color.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  title: { ...font.semibold, fontSize: 17, lineHeight: 22, color: color.textPrimary },
});
