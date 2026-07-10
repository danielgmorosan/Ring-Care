import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useIncidents } from '../api/hooks';
import type { IncidentSummary } from '../api/types';
import { Body, Card, Caption, Chip, H1, Screen } from '../components/ui';
import { space } from '../theme/tokens';
import { outcomeLabel, relativeTime } from '../incident-format';
import { IncidentDetailScreen } from './IncidentDetailScreen';

function IncidentCard({ incident, onPress }: { incident: IncidentSummary; onPress: () => void }) {
  const outcome = outcomeLabel(incident.outcome);
  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Body>{incident.reason}</Body>
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

/**
 * The incident timeline. Lists incidents from the append-only trail; tapping one
 * opens the full step ladder in human words. The same record hospitals and
 * regulators read.
 */
export function TimelineScreen() {
  const incidents = useIncidents();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId !== null) {
    return <IncidentDetailScreen id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const list = incidents.data ?? [];

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
            {list.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                onPress={() => setSelectedId(incident.id)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
