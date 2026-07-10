import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
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
  useUpdateFamily,
  useWipeDevice,
  useZones,
} from '../api/hooks';
import type { CheckinLanguage, FleetGuardian } from '../api/types';
import { useAuth } from '../auth-state';
import { Body, Button, Card, Caption, Chip, Dot, Field, H1, H2, Screen } from '../components/ui';
import { relativeTime } from '../incident-format';
import { LiveScreen } from './LiveScreen';
import { color, space, text } from '../theme/tokens';

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

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <View style={{ gap: space[1] }}>
          <Caption>GOOD MORNING</Caption>
          <H1>{session?.family.name ?? 'Home'}</H1>
        </View>

        <Card
          style={{ gap: space[3], backgroundColor: color.success100, borderColor: 'transparent' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Dot tone={online ? 'well' : 'attention'} />
            <H2>{list.length > 0 && online ? 'All is well' : 'Setting up'}</H2>
          </View>
          <Body muted>
            {list.length > 0
              ? `${list.length} guardian${list.length > 1 ? 's' : ''} registered. You will hear from us the moment anything changes.`
              : 'Register the recycled phone that will watch over your home.'}
          </Body>
        </Card>

        {summary.data?.text ? (
          <Card style={{ gap: space[2] }}>
            <Caption>TODAY</Caption>
            <Body>{summary.data.text}</Body>
          </Card>
        ) : null}

        {list.length === 0 ? (
          <Card style={{ gap: space[4] }}>
            <Caption>REGISTER A GUARDIAN</Caption>
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
          <View style={{ gap: space[2] }}>
            <Caption>GUARDIANS</Caption>
            {list.map((g) => (
              <GuardianCard key={g.id} guardian={g} />
            ))}
          </View>
        )}

        <ZonesCard />

        <Card style={{ gap: space[4] }}>
          <Caption>ASK OBRIGADA</Caption>
          <Field
            label="A question about the home"
            placeholder="How is everything?"
            value={question}
            onChangeText={setQuestion}
          />
          <Button
            label="Ask"
            onPress={askObrigada}
            loading={ask.isPending}
            disabled={question.trim().length === 0}
          />
          {answer ? <Body>{answer}</Body> : null}
        </Card>

        <HomeSettingsCard />

        {activity.data && activity.data.length > 0 ? (
          <View style={{ gap: space[2] }}>
            <Caption>RECENT ACTIVITY</Caption>
            <Card style={{ gap: space[3] }}>
              {activity.data.slice(0, 6).map((a) => (
                <View
                  key={a.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
                >
                  <View style={{ flex: 1 }}>
                    <Body>{a.label}</Body>
                  </View>
                  <Caption>{relativeTime(a.at)}</Caption>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <Button label="Sign out" variant="ghost" onPress={() => void logout()} />
      </View>
    </Screen>
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
    <Card style={{ gap: space[3] }}>
      <Caption>SAFETY ZONES</Caption>
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
                <Text style={st.zoneLink} onPress={() => setEditingId(null)}>
                  Cancel
                </Text>
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
              <Text
                style={st.zoneLink}
                onPress={() => {
                  setEditingId(z.id);
                  setDraft(z.name);
                }}
              >
                Rename
              </Text>
              <Text style={st.zoneRemove} onPress={() => confirmRemove(z.id, z.name)}>
                Remove
              </Text>
            </View>
          ),
        )
      )}
    </Card>
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
    <Card style={{ gap: space[4] }}>
      <Caption>HOME SETTINGS</Caption>
      <View style={{ gap: space[1] }}>
        <Body>Timezone: {current ?? '—'}</Body>
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

      <View style={{ gap: space[2] }}>
        <Body>Voice check-in language</Body>
        <Caption>
          When the guardian asks if all is well, it speaks this language. Set it to the one the
          elder understands.
        </Caption>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {CHECKIN_LANGUAGES.map((l) => (
            <View key={l.code} style={{ flex: 1 }}>
              <Button
                label={l.label}
                variant={language === l.code ? 'primary' : 'secondary'}
                disabled={language === l.code}
                onPress={() => void update.mutateAsync({ checkinLanguage: l.code })}
                loading={update.isPending && language !== l.code}
              />
            </View>
          ))}
        </View>
      </View>
    </Card>
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
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Dot tone={guardian.online ? 'well' : 'attention'} />
        <View style={{ flex: 1 }}>
          <Body>{guardian.name}</Body>
          <Caption>{healthLine(guardian)}</Caption>
        </View>
        <Chip tone={chip.tone}>{chip.label}</Chip>
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
          <Caption>ENTER THIS CODE ON THE PHONE</Caption>
          <Text style={st.code}>{code}</Text>
          <Body muted>It expires in 15 minutes. You can make a new one any time.</Body>
          <Button label="New code" variant="ghost" onPress={pair} loading={issueCode.isPending} />
        </View>
      ) : null}

      {!needsPairing ? (
        <Button label="See live" variant="secondary" onPress={() => setWatching(true)} />
      ) : null}

      {!needsPairing ? (
        <Text style={st.wipeLink} onPress={confirmWipe}>
          Decommission this phone
        </Text>
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
  pairBox: { gap: space[2], backgroundColor: color.bgSunken, borderRadius: 16, padding: space[4] },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 4, color: color.textPrimary },
  wipeLink: { color: color.textTertiary, fontSize: text.sm, alignSelf: 'flex-start' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  zoneActions: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  zoneLink: { color: color.action, fontSize: text.sm, fontWeight: '600' },
  zoneRemove: { color: color.incident500, fontSize: text.sm, fontWeight: '600' },
});
