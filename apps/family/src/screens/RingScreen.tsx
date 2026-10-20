import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  Divider,
  Icon,
  IconBadge,
  PageHeader,
  Pulse,
  Screen,
  SectionHeader,
  Segmented,
  type IconName,
} from '../components/ui';
import { relativeTime, stepTime } from '../incident-format';
import { color, font, radius, space, text } from '../theme/tokens';
import { RingLiveScreen } from './RingLiveScreen';

const PLACEMENTS: { value: RingPlacement; label: string }[] = [
  { value: 'front_door', label: 'Front door' },
  { value: 'indoor', label: 'Inside' },
  { value: 'other', label: 'Other' },
];

type Tone = 'neutral' | 'well' | 'attention' | 'incident' | 'accent' | 'info';

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

function activityLook(a: RingActivity): { title: string; icon: IconName; tone: Tone } {
  switch (a.kind) {
    case 'ding':
      return { title: `Doorbell at ${a.cameraName}`, icon: 'bell-ring', tone: 'info' };
    case 'online':
      return { title: `${a.cameraName} came online`, icon: 'wifi', tone: 'well' };
    case 'offline':
      return { title: `${a.cameraName} went offline`, icon: 'wifi', tone: 'attention' };
    case 'motion':
    default:
      return { title: `Motion at ${a.cameraName}`, icon: 'footprints', tone: 'neutral' };
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

        <PageHeader
          title="Ring"
          subtitle="At the front door"
          right={
            status.data ? (
              <View style={st.headerStatus}>
                <View
                  style={[
                    st.headerDot,
                    { backgroundColor: mode === 'off' ? color.neutral300 : color.success },
                  ]}
                />
                <Text style={st.headerStatusText}>{modeInfo.label}</Text>
              </View>
            ) : null
          }
        />

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
              <IconBadge icon="shield-check" tone={mode === 'off' ? 'neutral' : 'well'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.name}>Ring account</Text>
                <Caption>
                  {mode === 'off'
                    ? 'Off'
                    : status.data?.webhooks
                      ? 'Live events on'
                      : 'Live events not set up yet'}
                </Caption>
              </View>
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
          <SectionHeader icon="video" label="Cameras" />
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
          <SectionHeader icon="activity" label="Recent activity" />
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
            <Card style={{ paddingVertical: space[2] }}>
              {events.map((a, i) => (
                <View key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <ActivityRow activity={a} />
                </View>
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
    <Card style={{ gap: space[4], padding: space[3], borderRadius: radius.xl }}>
      <Pressable
        onPress={onWatch}
        style={({ pressed }) => [st.stage, pressed && { opacity: 0.92 }]}
        accessibilityRole="button"
        accessibilityLabel={`See ${camera.name} live`}
      >
        <View style={st.stageTop}>
          <View style={st.stageTag}>
            <View style={st.stageDotWrap}>
              {camera.online ? <Pulse color={color.success} size={8} /> : null}
              <View
                style={[
                  st.stageDot,
                  { backgroundColor: camera.online ? color.success : color.neutral300 },
                ]}
              />
            </View>
            <Text style={st.stageTagText}>{camera.online ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>
        <View style={st.stageCenter}>
          <View style={st.stagePlay}>
            <Icon name="video" size={26} color={color.textInverse} />
          </View>
          <Text style={st.stageHint}>Tap to see live</Text>
        </View>
        <View style={st.stageBottom}>
          <View style={{ flex: 1 }}>
            <Text style={st.stageName}>{camera.name}</Text>
            <Text style={st.stageMeta}>
              {camera.lastEventAt
                ? `Last activity ${relativeTime(camera.lastEventAt)}`
                : 'No activity yet'}
            </Text>
          </View>
          <Icon name="arrow-up-right" size={20} color={color.white75} />
        </View>
      </Pressable>

      <View style={{ gap: space[2], paddingHorizontal: space[2] }}>
        <SectionHeader label="Where it is" />
        <Segmented
          options={PLACEMENTS}
          value={camera.placement}
          onChange={(placement) => setPlacement.mutate({ id: camera.id, placement })}
        />
        {setPlacement.isError ? (
          <Caption>We couldn&apos;t save that. Try again in a moment.</Caption>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: space[2], paddingBottom: space[2], gap: space[2] }}>
        <Button label="See live" icon="video" onPress={onWatch} />
        {!camera.online ? (
          <Caption>This camera looks offline, so live view may not answer.</Caption>
        ) : null}
      </View>
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
      <IconBadge icon={look.icon} tone={look.tone} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text style={st.name}>{look.title}</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  name: { ...font.semibold, fontSize: 16, lineHeight: 21, color: color.textPrimary },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  headerStatusText: { ...font.medium, fontSize: 15, color: color.textTertiary },
  stage: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: color.bgDark,
    padding: space[4],
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  stageTop: { flexDirection: 'row' },
  stageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.white20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  stageDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageTagText: { ...font.semibold, fontSize: 11, letterSpacing: 1.4, color: color.textInverse },
  stageCenter: { alignItems: 'center', gap: space[2] },
  stagePlay: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.white20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageHint: { ...font.medium, fontSize: 13, color: color.white55 },
  stageBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3] },
  stageName: { ...font.semibold, fontSize: 18, color: color.textInverse },
  stageMeta: { ...font.regular, fontSize: 13, color: color.white75 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  metaText: { ...font.regular, fontSize: 13, color: color.textTertiary },
  simBadge: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  simText: { ...font.semibold, fontSize: 11, color: color.textSecondary },
  time: {
    ...font.medium,
    fontSize: text.sm,
    color: color.textTertiary,
    fontVariant: ['tabular-nums'],
  },
});
