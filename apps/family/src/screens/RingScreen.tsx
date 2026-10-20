import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  useRingActivity,
  useRingCameras,
  useRingStatus,
  useSetRingPlacement,
  useSyncRingCameras,
} from '../api/hooks';
import type { RingActivity, RingCamera, RingMode, RingPlacement } from '../api/types';
import {
  BackLink,
  Body,
  Button,
  Caption,
  Card,
  Chip,
  Dot,
  H1,
  H2,
  IconBadge,
  Screen,
  Segmented,
} from '../components/ui';
import { relativeTime, stepTime } from '../incident-format';
import { color, space, text } from '../theme/tokens';
import { RingLiveScreen } from './RingLiveScreen';

const PLACEMENTS: { value: RingPlacement; label: string }[] = [
  { value: 'front_door', label: 'Front door' },
  { value: 'indoor', label: 'Inside' },
  { value: 'other', label: 'Other' },
];

type Tone = 'neutral' | 'well' | 'attention' | 'incident' | 'accent';

/** How the Ring link reads, in a chip and a sentence. */
export function ringModeInfo(mode: RingMode): { label: string; tone: Tone; body: string } {
  switch (mode) {
    case 'oauth':
      return {
        label: 'Connected',
        tone: 'well',
        body: 'Your Ring account is linked. We read motion and doorbell events, never video.',
      };
    case 'playground':
      return {
        label: 'Playground',
        tone: 'accent',
        body: "Linked to Ring's developer playground. Events behave like the real thing.",
      };
    case 'off':
    default:
      return {
        label: 'Not connected',
        tone: 'neutral',
        body: 'Ring is not linked yet. Once it is, your Ring cameras appear here.',
      };
  }
}

/** Ring's Smart Alert label in plain words. */
function subTypeLabel(subType: string | null): string | null {
  if (!subType) return null;
  switch (subType) {
    case 'human':
      return 'Person';
    case 'vehicle':
      return 'Vehicle';
    case 'animal':
      return 'Animal';
    case 'package_delivery':
    case 'package':
      return 'Package';
    case 'other_motion':
      return 'Motion';
    default:
      return subType.charAt(0).toUpperCase() + subType.slice(1).replace(/_/g, ' ');
  }
}

function activityLook(a: RingActivity): { title: string; glyph: string; tone: Tone } {
  switch (a.kind) {
    case 'ding':
      return { title: `Doorbell at ${a.cameraName}`, glyph: '◉', tone: 'accent' };
    case 'online':
      return { title: `${a.cameraName} came online`, glyph: '✓', tone: 'well' };
    case 'offline':
      return { title: `${a.cameraName} went offline`, glyph: '–', tone: 'attention' };
    case 'motion':
    default:
      return { title: `Motion at ${a.cameraName}`, glyph: '≋', tone: 'neutral' };
  }
}

const INTERPRETATION: Record<
  NonNullable<RingActivity['interpretation']>,
  { label: string; tone: Tone }
> = {
  night_door: { label: 'Night door', tone: 'attention' },
  visit_arrival: { label: 'Visit arrival', tone: 'well' },
};

/** The Ring hub: link status, cameras and their placement, live view, and recent events. */
export function RingScreen({ onBack }: { onBack: () => void }) {
  const status = useRingStatus();
  const cameras = useRingCameras();
  const activity = useRingActivity();
  const sync = useSyncRingCameras();
  const [watching, setWatching] = useState<RingCamera | null>(null);

  const mode = status.data?.mode ?? 'off';
  const modeInfo = ringModeInfo(mode);
  const list = cameras.data ?? status.data?.cameras ?? [];
  const events = activity.data ?? [];

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <BackLink label="Home" onPress={onBack} />

        <View style={{ gap: space[1] }}>
          <Caption>AT THE DOOR</Caption>
          <H1>Ring</H1>
        </View>

        {status.isLoading ? (
          <Card>
            <Body muted>Checking your Ring link.</Body>
          </Card>
        ) : status.isError ? (
          <Card style={{ gap: space[3] }}>
            <Body>We couldn&apos;t reach Ring just now.</Body>
            <Body muted>Everything else keeps working. Try again in a moment.</Body>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void status.refetch()}
              loading={status.isFetching}
            />
          </Card>
        ) : (
          <Card style={{ gap: space[3] }}>
            <View style={st.row}>
              <IconBadge glyph="⌂" tone={mode === 'off' ? 'neutral' : 'accent'} />
              <View style={{ flex: 1 }}>
                <Body>Ring account</Body>
                <Caption>
                  {mode === 'off'
                    ? 'Off'
                    : status.data?.webhooks
                      ? 'Live events on'
                      : 'Live events not set up yet'}
                </Caption>
              </View>
              <Chip tone={modeInfo.tone}>{modeInfo.label}</Chip>
            </View>
            <Body muted>{modeInfo.body}</Body>
            {mode !== 'off' ? (
              <Button
                label="Sync cameras"
                variant="secondary"
                onPress={() => sync.mutate()}
                loading={sync.isPending}
              />
            ) : null}
            {sync.isError ? (
              <Caption>We couldn&apos;t sync with Ring. Try again in a moment.</Caption>
            ) : sync.isSuccess ? (
              <Caption>Cameras are up to date.</Caption>
            ) : null}
          </Card>
        )}

        <View style={{ gap: space[3] }}>
          <H2>Cameras</H2>
          {cameras.isLoading && list.length === 0 ? (
            <Card>
              <Body muted>Loading your cameras.</Body>
            </Card>
          ) : list.length === 0 ? (
            <Card style={{ gap: space[2] }}>
              <Body>No Ring cameras yet.</Body>
              <Body muted>
                {mode === 'off'
                  ? 'Link a Ring account and your doorbell and cameras will show up here.'
                  : 'Tap Sync cameras to bring in the devices on your Ring account.'}
              </Body>
            </Card>
          ) : (
            list.map((c) => <CameraCard key={c.id} camera={c} onWatch={() => setWatching(c)} />)
          )}
          {list.length > 0 ? (
            <Caption>Night door alerts and visit arrivals use cameras set to Front door.</Caption>
          ) : null}
        </View>

        <View style={{ gap: space[3] }}>
          <H2>Recent activity</H2>
          {activity.isLoading ? (
            <Card>
              <Body muted>Loading recent activity.</Body>
            </Card>
          ) : activity.isError ? (
            <Card style={{ gap: space[3] }}>
              <Body muted>We couldn&apos;t load Ring activity just now.</Body>
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => void activity.refetch()}
                loading={activity.isFetching}
              />
            </Card>
          ) : events.length === 0 ? (
            <Card>
              <Body muted>
                Quiet so far. Motion and doorbell presses from your Ring cameras will appear here.
              </Body>
            </Card>
          ) : (
            <Card style={{ gap: space[4] }}>
              {events.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </Card>
          )}
        </View>
      </View>

      {watching ? <RingLiveScreen camera={watching} onClose={() => setWatching(null)} /> : null}
    </Screen>
  );
}

/** One Ring camera: health, last activity, where it sits, and live view. */
function CameraCard({ camera, onWatch }: { camera: RingCamera; onWatch: () => void }) {
  const setPlacement = useSetRingPlacement();
  return (
    <Card style={{ gap: space[4] }}>
      <View style={st.row}>
        <Dot tone={camera.online ? 'well' : 'attention'} />
        <View style={{ flex: 1 }}>
          <Body>{camera.name}</Body>
          <Caption>
            {camera.lastEventAt
              ? `Last activity ${relativeTime(camera.lastEventAt)}`
              : 'No activity yet'}
          </Caption>
        </View>
        <Chip tone={camera.online ? 'well' : 'attention'}>
          {camera.online ? 'online' : 'offline'}
        </Chip>
      </View>

      <View style={{ gap: space[2] }}>
        <Caption>WHERE IT IS</Caption>
        <Segmented
          options={PLACEMENTS}
          value={camera.placement}
          onChange={(placement) => setPlacement.mutate({ id: camera.id, placement })}
        />
        {setPlacement.isError ? (
          <Caption>We couldn&apos;t save that. Try again in a moment.</Caption>
        ) : null}
      </View>

      <Button label="See live" variant="secondary" onPress={onWatch} />
      {!camera.online ? (
        <Caption>This camera looks offline, so live view may not answer.</Caption>
      ) : null}
    </Card>
  );
}

function ActivityRow({ activity }: { activity: RingActivity }) {
  const look = activityLook(activity);
  const label = subTypeLabel(activity.subType);
  const interpretation = activity.interpretation ? INTERPRETATION[activity.interpretation] : null;
  const time = stepTime(activity.occurredAt);
  return (
    <View style={st.row}>
      <IconBadge glyph={look.glyph} tone={look.tone} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Body>{look.title}</Body>
        <View style={st.meta}>
          {label ? <Text style={st.metaText}>{`Smart Alert: ${label}`}</Text> : null}
          <Text style={st.metaText}>{relativeTime(activity.occurredAt)}</Text>
          {activity.source === 'simulator' ? (
            <View style={st.simBadge}>
              <Text style={st.simText}>Simulated</Text>
            </View>
          ) : null}
        </View>
        {interpretation ? <Chip tone={interpretation.tone}>{interpretation.label}</Chip> : null}
      </View>
      {time ? <Text style={st.time}>{time}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  metaText: { fontSize: text.xs, color: color.textTertiary },
  simBadge: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  simText: { fontSize: 11, fontWeight: '600', color: color.textSecondary },
  time: { fontSize: text.sm, color: color.textTertiary, fontVariant: ['tabular-nums'] },
});
