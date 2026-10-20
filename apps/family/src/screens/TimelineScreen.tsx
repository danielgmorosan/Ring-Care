import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useIncidents, useVisitArrivals } from '../api/hooks';
import type { IncidentSummary, VisitArrival } from '../api/types';
import { Body, Button, Card, Caption, Chip, H1, IconBadge, Screen } from '../components/ui';
import { space } from '../theme/tokens';
import { outcomeLabel, reasonInfo, relativeTime } from '../incident-format';
import { IncidentDetailScreen } from './IncidentDetailScreen';

function IncidentCard({ incident, onPress }: { incident: IncidentSummary; onPress: () => void }) {
  const outcome = outcomeLabel(incident.outcome);
  const reason = reasonInfo(incident.reason);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={reason.label}>
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <IconBadge glyph={reason.glyph} tone={reason.tone} />
          <View style={{ flex: 1 }}>
            <Body>{reason.label}</Body>
            <Caption>
              {`${relativeTime(incident.openedAt)} · ${incident.stepCount} step${
                incident.stepCount === 1 ? '' : 's'
              }`}
            </Caption>
          </View>
          <Chip tone={outcome.tone}>{outcome.label}</Chip>
        </View>
      </Card>
    </Pressable>
  );
}

/** An expected visitor arrived. Informational: nothing to open, nothing to act on. */
function ArrivalCard({ arrival }: { arrival: VisitArrival }) {
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <IconBadge glyph="✓" tone="well" />
        <View style={{ flex: 1 }}>
          <Body>{arrival.text}</Body>
          <Caption>{`${relativeTime(arrival.arrivedAt)} · Seen by Ring at the front door`}</Caption>
        </View>
        <Chip tone="well">Arrived</Chip>
      </View>
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
        <View style={{ gap: space[1] }}>
          <Caption>EVERY STEP, IN HUMAN WORDS</Caption>
          <H1>Timeline</H1>
        </View>

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
          <View style={{ gap: space[3] }}>
            {list.map((entry) =>
              entry.kind === 'incident' ? (
                <IncidentCard
                  key={`incident-${entry.incident.id}`}
                  incident={entry.incident}
                  onPress={() => setSelectedId(entry.incident.id)}
                />
              ) : (
                <ArrivalCard key={`arrival-${entry.arrival.id}`} arrival={entry.arrival} />
              ),
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}
