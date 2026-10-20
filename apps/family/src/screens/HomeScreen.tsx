import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  useActivity,
  useAsk,
  useDailySummary,
  useDeleteZone,
  useFamily,
  useFleet,
  useIssueClaimCode,
  useRegisterDevice,
  useRenameZone,
  useRingActivity,
  useRingStatus,
  useUpdateFamily,
  useWipeDevice,
  useZones,
} from '../api/hooks';
import type { CheckinLanguage, FleetGuardian } from '../api/types';
import { useAuth } from '../auth-state';
import {
  Body,
  Button,
  Card,
  Caption,
  Chip,
  Divider,
  Dot,
  Field,
  Icon,
  PageHeader,
  Screen,
  SectionHeader,
  Segmented,
  TextAction,
} from '../components/ui';
import { relativeTime } from '../incident-format';
import { LiveScreen } from './LiveScreen';
import { ringModeInfo, RingScreen } from './RingScreen';
import { color, font, radius, shadow, space, text } from '../theme/tokens';

/** "Good morning" by the clock on this phone. */
function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Tuesday, 20 October" for the header. */
function todayLabel(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** The Today home. Status, the guardians, and registering the first one. */
export function HomeScreen() {
  const { session, logout } = useAuth();
  const fleet = useFleet();
  const summary = useDailySummary();
  const activity = useActivity();
  const ask = useAsk();
  const registerDevice = useRegisterDevice();
  const [deviceName, setDeviceName] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [showRing, setShowRing] = useState(false);

  async function askObrigada() {
    if (question.trim().length === 0) return;
    const result = await ask.mutateAsync(question.trim());
    setAnswer(result.answer);
    setQuestion('');
  }

  const list = fleet.data ?? [];
  const online = list.some((g) => g.online);

  async function addGuardian() {
    if (deviceName.trim().length === 0) return;
    await registerDevice.mutateAsync(deviceName.trim());
    setDeviceName('');
  }

  if (showRing) {
    return <RingScreen onBack={() => setShowRing(false)} />;
  }

  const online_count = list.filter((g) => g.online).length;
  const incidentsToday = summary.data?.incidentCount ?? 0;
  const allWell = list.length > 0 && online;

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <PageHeader
          eyebrow={todayLabel()}
          title={greeting()}
          subtitle={`The ${session?.family.name ?? 'family'} home`}
        />

        <Card style={st.hero}>
          <View style={st.heroTop}>
            <View style={st.heroIcon}>
              <Icon name="home" size={26} color={color.textPrimary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.heroTitle}>Mom&apos;s home</Text>
              <Caption>
                {list.length > 0
                  ? `Watched by ${list.length} guardian${list.length > 1 ? 's' : ''}`
                  : 'No guardian yet'}
              </Caption>
            </View>
          </View>
          <View style={[st.statusRow, allWell ? st.statusWell : st.statusSetup]}>
            <View style={[st.statusBar, allWell ? st.statusBarWell : st.statusBarSetup]} />
            <Dot tone={online ? 'well' : 'attention'} pulse={allWell} />
            <Text
              style={[st.statusText, { color: allWell ? color.success700 : color.attention700 }]}
            >
              {allWell ? 'All is well' : 'Setting up'}
            </Text>
          </View>
          <Body muted>
            {list.length > 0
              ? 'You will hear from us the moment anything changes.'
              : 'Register the recycled phone that will watch over your home.'}
          </Body>
        </Card>

        {list.length > 0 ? (
          <View style={st.stats}>
            <Stat value={`${online_count}/${list.length}`} label="Online" tone="well" />
            <Stat
              value={String(incidentsToday)}
              label={incidentsToday === 1 ? 'Incident' : 'Incidents'}
              tone={incidentsToday > 0 ? 'attention' : 'neutral'}
            />
            <Stat value={String(activity.data?.length ?? 0)} label="Updates" tone="neutral" />
          </View>
        ) : null}

        {summary.data?.text ? (
          <View style={{ gap: space[3] }}>
            <SectionHeader icon="sparkles" label="Today" />
            <Card>
              <Text style={st.summary}>{summary.data.text}</Text>
            </Card>
          </View>
        ) : null}

        {list.length === 0 ? (
          <Card style={{ gap: space[4] }}>
            <SectionHeader icon="smartphone" label="Register a guardian" />
            <Field
              label="Guardian name"
              placeholder="Kitchen shelf"
              value={deviceName}
              onChangeText={setDeviceName}
              hint="Where the phone sits, e.g. Kitchen shelf."
            />
            <Button
              label="Register guardian"
              onPress={addGuardian}
              loading={registerDevice.isPending}
              disabled={deviceName.trim().length === 0}
            />
          </Card>
        ) : (
          <View style={{ gap: space[3] }}>
            <SectionHeader icon="smartphone" label="Guardians" />
            {list.map((g) => (
              <GuardianCard key={g.id} guardian={g} />
            ))}
          </View>
        )}

        <RingCard onOpen={() => setShowRing(true)} />

        <View style={{ gap: space[3] }}>
          <SectionHeader icon="sparkles" label="Ask Obrigada" />
          <Card style={{ gap: space[4] }}>
            <View style={st.askHead}>
              <View style={st.askBadge}>
                <Icon name="sparkles" size={18} color={color.textInverse} />
              </View>
              <Text style={st.askLabel}>A question about the home</Text>
            </View>
            <View style={st.askRow}>
              <TextInput
                style={st.askInput}
                placeholder="How is everything?"
                placeholderTextColor={color.textTertiary}
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={() => void askObrigada()}
                accessibilityLabel="A question about the home"
              />
              <Pressable
                onPress={question.trim().length === 0 || ask.isPending ? undefined : askObrigada}
                style={[st.askBtn, question.trim().length === 0 && st.askBtnOff]}
                accessibilityRole="button"
                accessibilityLabel="Ask"
                accessibilityState={{ disabled: question.trim().length === 0, busy: ask.isPending }}
              >
                <Icon name="send" size={16} color={color.textInverse} />
                <Text style={st.askBtnText}>{ask.isPending ? '…' : 'Ask'}</Text>
              </Pressable>
            </View>
            {answer ? (
              <View style={st.answer}>
                <Text style={st.answerText}>{answer}</Text>
              </View>
            ) : null}
          </Card>
        </View>

        <ZonesCard />

        <HomeSettingsCard />

        {activity.data && activity.data.length > 0 ? (
          <View style={{ gap: space[3] }}>
            <SectionHeader icon="clock" label="Recent" />
            <Card style={st.recent}>
              {activity.data.slice(0, 6).map((a, i) => (
                <View key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={st.recentRow}>
                    <Text style={st.recentTime}>{relativeTime(a.at)}</Text>
                    <View style={st.recentDot} />
                    <Text style={st.recentText}>{a.label}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <Button label="Sign out" variant="ghost" icon="log-out" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

/** One NestHome stat tile: a big number over a dotted label. */
function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: 'well' | 'attention' | 'neutral';
}) {
  const dot =
    tone === 'well' ? color.success : tone === 'attention' ? color.attention500 : color.neutral300;
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <View style={st.statLabelRow}>
        <View style={[st.statDot, { backgroundColor: dot }]} />
        <Text style={st.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Ring at a glance: link status, cameras, the latest door event. Opens the Ring screen. */
function RingCard({ onOpen }: { onOpen: () => void }) {
  const status = useRingStatus();
  const activity = useRingActivity(5);
  const mode = status.data?.mode ?? 'off';
  const info = ringModeInfo(mode);
  const cameras = status.data?.cameras ?? [];
  const latest = activity.data?.[0];

  let line: string;
  if (status.isLoading) line = 'Checking your Ring link.';
  else if (status.isError) line = "We couldn't reach Ring just now.";
  else if (mode === 'off') line = 'Add your Ring doorbell to watch the front door too.';
  else if (cameras.length === 0) line = 'Linked. Sync to bring in your cameras.';
  else
    line = `${cameras.length} camera${cameras.length === 1 ? '' : 's'}${
      latest ? ` · Last activity ${relativeTime(latest.occurredAt)}` : ''
    }`;

  return (
    <View style={{ gap: space[3] }}>
      <SectionHeader icon="video" label="At the door" />
      <Card dark style={st.ring}>
        <View style={st.ringTop}>
          <View style={st.ringTag}>
            <Icon name="bell-ring" size={14} color={color.textInverse} />
            <Text style={st.ringTagText}>RING</Text>
          </View>
          {status.data ? (
            <View style={st.ringChip}>
              <View
                style={[
                  st.ringChipDot,
                  { backgroundColor: mode === 'off' ? color.neutral300 : color.success },
                ]}
              />
              <Text style={st.ringChipText}>{info.label}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={st.ringTitle}>
            {cameras.length > 0 ? (cameras[0]?.name ?? 'Front door') : 'Front door'}
          </Text>
          <Text style={st.ringLine}>{line}</Text>
        </View>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [st.ringBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Open Ring"
        >
          <Text style={st.ringBtnText}>Open Ring</Text>
          <Icon name="chevron-right" size={18} color={color.textPrimary} />
        </Pressable>
      </Card>
    </View>
  );
}

/** The device's own IANA timezone, e.g. "Europe/Lisbon". */
function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Household settings: the home's timezone, which decides what "today" means for
 * the daily summary and care view. Editable after signup — one tap syncs it to
 * this phone's timezone, which is the common case (a caregiver setting it up).
 */
const CHECKIN_LANGUAGES: { code: CheckinLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt-PT', label: 'Português' },
];

/**
 * The safety zones drawn on the family's guardians. Drawn on the device itself (the camera
 * view never leaves it, rule #1); here the caregiver sees what's set and can rename or remove
 * a zone. Redrawing happens back on the guardian.
 */
function ZonesCard() {
  const zones = useZones();
  const fleet = useFleet();
  const rename = useRenameZone();
  const del = useDeleteZone();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const list = zones.data ?? [];

  const guardianName = (deviceId: string) =>
    fleet.data?.find((g) => g.id === deviceId)?.name ?? 'a guardian';

  function confirmRemove(id: string, name: string) {
    Alert.alert('Remove this zone?', `"${name}" will no longer be watched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void del.mutate(id) },
    ]);
  }

  async function saveRename(id: string) {
    const name = draft.trim();
    if (name.length > 0) await rename.mutateAsync({ id, name });
    setEditingId(null);
  }

  return (
    <View style={{ gap: space[3] }}>
      <SectionHeader icon="map-pin" label="Safety zones" />
      <Card style={{ gap: space[3] }}>
        {list.length === 0 ? (
          <Body muted>
            Draw hazard areas and doorways on the guardian itself, under &quot;Draw a zone&quot;.
            They&apos;ll appear here to rename or remove.
          </Body>
        ) : (
          list.map((z) =>
            editingId === z.id ? (
              <View key={z.id} style={{ gap: space[2] }}>
                <Field
                  label="Zone name"
                  value={draft}
                  onChangeText={setDraft}
                  autoCapitalize="words"
                />
                <View style={st.zoneActions}>
                  <Button
                    label="Save"
                    onPress={() => void saveRename(z.id)}
                    loading={rename.isPending}
                  />
                  <TextAction label="Cancel" onPress={() => setEditingId(null)} />
                </View>
              </View>
            ) : (
              <View key={z.id} style={st.zoneRow}>
                <View style={{ flex: 1 }}>
                  <Body>{z.name}</Body>
                  <Caption>
                    {z.kind === 'hazard' ? 'Hazard' : 'Door'} · {guardianName(z.deviceId)}
                  </Caption>
                </View>
                <Chip tone={z.kind === 'hazard' ? 'attention' : 'neutral'}>{z.kind}</Chip>
                <TextAction
                  label="Rename"
                  onPress={() => {
                    setEditingId(z.id);
                    setDraft(z.name);
                  }}
                />
                <TextAction label="Remove" danger onPress={() => confirmRemove(z.id, z.name)} />
              </View>
            ),
          )
        )}
      </Card>
    </View>
  );
}

function HomeSettingsCard() {
  const family = useFamily();
  const update = useUpdateFamily();
  const current = family.data?.timezone;
  const phone = deviceTimezone();
  const matches = current === phone;
  const language = family.data?.checkinLanguage;

  return (
    <View style={{ gap: space[3] }}>
      <SectionHeader icon="settings" label="Home settings" />
      <Card style={{ gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <View style={st.settingRow}>
            <Icon name="globe" size={18} color={color.textSecondary} />
            <Body strong>Timezone</Body>
            <Text style={st.settingValue}>{current ?? 'Not set'}</Text>
          </View>
          <Caption>The daily summary and care times follow the home's timezone.</Caption>
        </View>
        {current && !matches ? (
          <Button
            label={`Use this phone's timezone (${phone})`}
            variant="secondary"
            onPress={() => void update.mutateAsync({ timezone: phone })}
            loading={update.isPending}
          />
        ) : null}

        <Divider />
        <View style={{ gap: space[2] }}>
          <View style={st.settingRow}>
            <Icon name="mic" size={18} color={color.textSecondary} />
            <Body strong>Voice check-in language</Body>
          </View>
          <Caption>
            When the guardian asks if all is well, it speaks this language. Set it to the one the
            elder understands.
          </Caption>
          <Segmented
            options={CHECKIN_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            value={language ?? ('' as CheckinLanguage)}
            onChange={(code) => void update.mutateAsync({ checkinLanguage: code })}
          />
        </View>
      </Card>
    </View>
  );
}

/** The health line under a guardian's name: when we last heard from it, battery, app. */
function healthLine(g: FleetGuardian): string {
  if (!g.lastSeenAt) return 'Not connected yet';
  const parts = [`Seen ${relativeTime(g.lastSeenAt)}`];
  if (g.batteryPct !== null) parts.push(`${g.batteryPct}%`);
  if (g.appVersion) parts.push(`v${g.appVersion}`);
  return parts.join(' · ');
}

function statusChip(g: FleetGuardian): { tone: 'well' | 'attention' | 'neutral'; label: string } {
  if (g.online) return { tone: 'well', label: 'online' };
  if (g.status === 'registered') return { tone: 'neutral', label: 'needs pairing' };
  return { tone: 'attention', label: 'offline' };
}

/** One guardian: its health, pairing if not set up, and decommissioning a lost/retired phone. */
function GuardianCard({ guardian }: { guardian: FleetGuardian }) {
  const issueCode = useIssueClaimCode();
  const wipe = useWipeDevice();
  const [code, setCode] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const needsPairing = guardian.status === 'registered';
  const chip = statusChip(guardian);

  async function pair() {
    const issued = await issueCode.mutateAsync(guardian.id);
    setCode(issued.code);
  }

  function confirmWipe() {
    Alert.alert(
      `Wipe ${guardian.name}?`,
      'This clears the phone completely — its pairing, the faces enrolled on it, and anything it has queued. Use this for a lost or retired phone. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Wipe', style: 'destructive', onPress: () => void wipe.mutate(guardian.id) },
      ],
    );
  }

  return (
    <Card style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={st.deviceIcon}>
          <Icon name="smartphone" size={22} color={color.textPrimary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.deviceName}>{guardian.name}</Text>
          <Caption>{healthLine(guardian)}</Caption>
        </View>
        <Chip tone={chip.tone} dot>
          {chip.label}
        </Chip>
      </View>

      {needsPairing && code === null ? (
        <Button
          label="Pair this phone"
          variant="secondary"
          onPress={pair}
          loading={issueCode.isPending}
        />
      ) : null}

      {code !== null ? (
        <View style={st.pairBox}>
          <SectionHeader label="Enter this code on the phone" />
          <Text style={st.code}>{code}</Text>
          <Body muted>It expires in 15 minutes. You can make a new one any time.</Body>
          <Button label="New code" variant="ghost" onPress={pair} loading={issueCode.isPending} />
        </View>
      ) : null}

      {!needsPairing ? (
        <Button label="See live" icon="video" onPress={() => setWatching(true)} />
      ) : null}

      {!needsPairing ? (
        <Pressable onPress={confirmWipe} style={st.wipe} accessibilityRole="button">
          <Text style={st.wipeLink}>Decommission this phone</Text>
        </Pressable>
      ) : null}

      {watching ? (
        <LiveScreen
          deviceId={guardian.id}
          guardianName={guardian.name}
          onClose={() => setWatching(false)}
        />
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  hero: { gap: space[4], padding: space[5], borderRadius: radius.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.bgSunken,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...font.bold,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: color.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 52,
    paddingLeft: space[5],
    paddingRight: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusWell: { backgroundColor: color.success100, borderColor: '#CDEBD0' },
  statusSetup: { backgroundColor: color.attention100, borderColor: '#FCDDB4' },
  statusBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderRadius: 2 },
  statusBarWell: { backgroundColor: color.success },
  statusBarSetup: { backgroundColor: color.attention500 },
  statusText: { ...font.semibold, fontSize: 17 },
  stats: { flexDirection: 'row', gap: space[3] },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: space[4],
    backgroundColor: color.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.card,
  },
  statValue: { ...font.bold, fontSize: 28, letterSpacing: -0.6, color: color.textPrimary },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { ...font.medium, fontSize: 13, color: color.textTertiary },
  summary: { ...font.regular, fontSize: 17, lineHeight: 26, color: color.textPrimary },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.bgSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceName: { ...font.semibold, fontSize: 17, color: color.textPrimary },
  ring: { gap: space[4], borderRadius: radius.xl, padding: space[5] },
  ringTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ringTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.white20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  ringTagText: { ...font.semibold, fontSize: 12, letterSpacing: 1.4, color: color.textInverse },
  ringChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringChipDot: { width: 7, height: 7, borderRadius: 4 },
  ringChipText: { ...font.medium, fontSize: 13, color: color.white75 },
  ringTitle: { ...font.bold, fontSize: 22, letterSpacing: -0.4, color: color.textInverse },
  ringLine: { ...font.regular, fontSize: 15, lineHeight: 21, color: color.white75 },
  ringBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: color.bgSurface,
  },
  ringBtnText: { ...font.semibold, fontSize: text.md, color: color.textPrimary },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  askBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askLabel: { ...font.semibold, fontSize: text.md, color: color.textPrimary, flex: 1 },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: color.bgSunken,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingLeft: space[4],
    paddingRight: 6,
    paddingVertical: 6,
  },
  askInput: {
    ...font.regular,
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: text.md,
    color: color.textPrimary,
  },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.ink,
  },
  askBtnOff: { opacity: 0.35 },
  askBtnText: { ...font.semibold, fontSize: text.sm, color: color.textInverse },
  answer: {
    backgroundColor: color.bgSunken,
    borderRadius: radius.md,
    padding: space[4],
  },
  answerText: { ...font.regular, fontSize: text.md, lineHeight: 24, color: color.textPrimary },
  recent: { paddingVertical: space[1] },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 },
  recentTime: {
    ...font.regular,
    width: 64,
    fontSize: 13,
    color: color.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  recentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.neutral200 },
  recentText: { ...font.regular, flex: 1, fontSize: 15, color: color.textPrimary },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  settingValue: {
    ...font.medium,
    marginLeft: 'auto',
    fontSize: text.sm,
    color: color.textSecondary,
  },
  pairBox: { gap: space[2], backgroundColor: color.bgSunken, borderRadius: 16, padding: space[4] },
  code: { ...font.bold, fontSize: 30, letterSpacing: 4, color: color.textPrimary },
  wipe: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  wipeLink: { ...font.regular, color: color.textTertiary, fontSize: text.sm },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  zoneActions: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
