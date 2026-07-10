import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth-state';
import {
  useCreateContact,
  useCreatePerson,
  useIssueClaimCode,
  useRegisterDevice,
  useUpdateFamily,
} from '../api/hooks';
import type { CheckinLanguage, HouseholdRole } from '../api/types';
import { Body, Button, Caption, Card, Field, H1, H2 } from '../components/ui';
import { color, gradient, radius, space, text } from '../theme/tokens';

/**
 * First-run setup for a new caregiver. Walks through the essentials in order and makes
 * sure the two safety-relevant ones get done: the elder's check-in language and at least
 * one person to call. Everything here reuses the same hooks as the rest of the app, so a
 * step's data is persisted the moment it is entered, not held until the end.
 *
 * The pictures that teach Obrigada each face are NOT taken here. Face photos and embeddings
 * are biometrics and never leave the guardian phone (rules #1/#4), so this flow collects the
 * household roster (names only) and hands the caregiver to the guardian to capture the faces.
 */

const LANGUAGES: { value: CheckinLanguage; label: string; sub: string }[] = [
  { value: 'en', label: 'English', sub: 'Obrigada speaks English at check-in' },
  { value: 'pt-PT', label: 'Português', sub: 'Obrigada fala português no check-in' },
];

const ROLE_OPTIONS: { value: HouseholdRole; label: string }[] = [
  { value: 'resident', label: 'Lives here' },
  { value: 'family', label: 'Family' },
  { value: 'caregiver', label: 'Carer' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
];

type StepKey = 'welcome' | 'household' | 'contacts' | 'people' | 'guardian' | 'done';
const FLOW: StepKey[] = ['welcome', 'household', 'contacts', 'people', 'guardian', 'done'];
const MIDDLE: StepKey[] = ['household', 'contacts', 'people', 'guardian'];

export function OnboardingScreen() {
  const { session, completeOnboarding } = useAuth();
  const updateFamily = useUpdateFamily();
  const createContact = useCreateContact();
  const createPerson = useCreatePerson();
  const registerDevice = useRegisterDevice();
  const issueCode = useIssueClaimCode();

  const [index, setIndex] = useState(0);
  const step = FLOW[index];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Household.
  const detectedTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [timezone, setTimezone] = useState(detectedTz);
  const [language, setLanguage] = useState<CheckinLanguage | null>(null);

  // Who we call, and who lives here (persisted on add; mirrored locally for display).
  const [contacts, setContacts] = useState<{ name: string; role: string }[]>([]);
  const [people, setPeople] = useState<{ title: string; role: HouseholdRole }[]>([]);

  // Guardian pairing.
  const [pairing, setPairing] = useState<{ name: string; code: string } | null>(null);

  const familyName = session?.family.name ?? 'your family';

  function goNext() {
    setError(null);
    setIndex((i) => Math.min(i + 1, FLOW.length - 1));
  }
  function goBack() {
    setError(null);
    setIndex((i) => Math.max(i - 1, 0));
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Persist the household settings, then advance. Language is required (safety).
  function submitHousehold() {
    if (!language) return;
    void run(async () => {
      await updateFamily.mutateAsync({
        timezone: timezone.trim() || detectedTz,
        checkinLanguage: language,
      });
      goNext();
    });
  }

  async function addContact(name: string, phone: string, role: string) {
    await run(async () => {
      await createContact.mutateAsync({
        name: name.trim(),
        role: role.trim() || 'Family',
        phone: phone.trim() || undefined,
        priority: contacts.length + 1,
      });
      setContacts((c) => [...c, { name: name.trim(), role: role.trim() || 'Family' }]);
    });
  }

  async function addPerson(title: string, role: HouseholdRole) {
    await run(async () => {
      await createPerson.mutateAsync({ title: title.trim(), role });
      setPeople((p) => [...p, { title: title.trim(), role }]);
    });
  }

  async function createPairing(name: string) {
    await run(async () => {
      const device = await registerDevice.mutateAsync(name.trim() || 'Living room');
      const code = await issueCode.mutateAsync(device.id);
      setPairing({ name: device.name, code: code.code });
    });
  }

  function finish() {
    void run(async () => {
      await completeOnboarding();
    });
  }

  if (step === 'welcome') {
    return <Welcome familyName={familyName} onStart={goNext} />;
  }

  const stepNo = MIDDLE.indexOf(step) + 1;

  return (
    <View style={s.shell}>
      {step !== 'done' ? <Progress current={stepNo} total={MIDDLE.length} /> : null}

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 'household' ? (
          <HouseholdStep
            timezone={timezone}
            onTimezone={setTimezone}
            language={language}
            onLanguage={setLanguage}
          />
        ) : step === 'contacts' ? (
          <ContactsStep contacts={contacts} onAdd={addContact} busy={busy} />
        ) : step === 'people' ? (
          <PeopleStep people={people} onAdd={addPerson} busy={busy} />
        ) : step === 'guardian' ? (
          <GuardianStep
            pairing={pairing}
            onCreate={createPairing}
            busy={busy}
            peopleCount={people.length}
          />
        ) : (
          <DoneStep
            familyName={familyName}
            language={language}
            contactsCount={contacts.length}
            peopleCount={people.length}
            paired={pairing !== null}
          />
        )}
        {error ? <Caption>{error}</Caption> : null}
      </ScrollView>

      <View style={s.footer}>
        {step !== 'done' ? (
          <Pressable onPress={goBack} style={s.back} hitSlop={12}>
            <Text style={s.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={s.footerCta}>
          {step === 'household' ? (
            <Button
              label="Continue"
              onPress={submitHousehold}
              loading={busy}
              disabled={!language}
            />
          ) : step === 'contacts' ? (
            <Button label="Continue" onPress={goNext} disabled={contacts.length === 0} />
          ) : step === 'people' ? (
            <Button
              label={people.length ? 'Continue' : 'Skip for now'}
              onPress={goNext}
              variant={people.length ? 'primary' : 'secondary'}
            />
          ) : step === 'guardian' ? (
            <Button
              label={pairing ? 'Continue' : 'Skip for now'}
              onPress={goNext}
              variant={pairing ? 'primary' : 'secondary'}
            />
          ) : (
            <Button label="Go to Obrigada" onPress={finish} loading={busy} />
          )}
        </View>
      </View>
    </View>
  );
}

function Welcome({ familyName, onStart }: { familyName: string; onStart: () => void }) {
  return (
    <LinearGradient colors={gradient.morning} style={s.welcome}>
      <View style={s.welcomeBody}>
        <Text style={s.brand}>OBRIGADA</Text>
        <Text style={s.welcomeTitle}>Let us set things up for {familyName}.</Text>
        <Body muted>
          Obrigada keeps a quiet eye on things at home, so you do not have to. This takes about
          three minutes, and you can change any of it later.
        </Body>
      </View>
      <View style={s.welcomeCta}>
        <Button label="Get started" onPress={onStart} />
      </View>
    </LinearGradient>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.progress}>
      <View style={s.progressBars}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[s.progressBar, i < current && s.progressBarOn]} />
        ))}
      </View>
      <Caption>
        Step {current} of {total}
      </Caption>
    </View>
  );
}

function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <H1>{title}</H1>
      <Body muted>{children}</Body>
    </View>
  );
}

function HouseholdStep({
  timezone,
  onTimezone,
  language,
  onLanguage,
}: {
  timezone: string;
  onTimezone: (v: string) => void;
  language: CheckinLanguage | null;
  onLanguage: (v: CheckinLanguage) => void;
}) {
  return (
    <View style={{ gap: space[6] }}>
      <StepHeader title="Your household">
        A couple of basics so the day lines up and Obrigada speaks the right language.
      </StepHeader>

      <Card style={{ gap: space[5] }}>
        <Field
          label="Time zone"
          value={timezone}
          onChangeText={onTimezone}
          autoCapitalize="none"
          hint="Detected from your phone. This sets what counts as today."
        />
      </Card>

      <View style={{ gap: space[3] }}>
        <H2>Check-in language</H2>
        <Body muted>
          The language Obrigada speaks out loud during a check-in. It has to be the one they
          understand.
        </Body>
        <View style={{ gap: space[3] }}>
          {LANGUAGES.map((l) => (
            <SelectCard
              key={l.value}
              selected={language === l.value}
              onPress={() => onLanguage(l.value)}
              title={l.label}
              sub={l.sub}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function ContactsStep({
  contacts,
  onAdd,
  busy,
}: {
  contacts: { name: string; role: string }[];
  onAdd: (name: string, phone: string, role: string) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');

  async function add() {
    if (!name.trim()) return;
    await onAdd(name, phone, role);
    setName('');
    setPhone('');
    setRole('');
  }

  return (
    <View style={{ gap: space[6] }}>
      <StepHeader title="Who we call">
        If something is wrong and they cannot answer, who should we reach? We call them in order
        until someone picks up. If no one does, we call emergency services.
      </StepHeader>

      {contacts.length ? (
        <View style={{ gap: space[2] }}>
          {contacts.map((c, i) => (
            <ListRow key={i} index={i + 1} title={c.name} sub={c.role} />
          ))}
        </View>
      ) : null}

      <Card style={{ gap: space[4] }}>
        <Field
          label="Name"
          placeholder="Ana Silva"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <Field
          label="Phone"
          placeholder="+351 …"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Relationship"
          placeholder="Daughter"
          value={role}
          onChangeText={setRole}
          autoCapitalize="words"
        />
        <Button
          label="Add contact"
          variant="secondary"
          onPress={add}
          loading={busy}
          disabled={!name.trim()}
        />
      </Card>
    </View>
  );
}

function PeopleStep({
  people,
  onAdd,
  busy,
}: {
  people: { title: string; role: HouseholdRole }[];
  onAdd: (title: string, role: HouseholdRole) => Promise<void>;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<HouseholdRole>('resident');

  async function add() {
    if (!title.trim()) return;
    await onAdd(title, role);
    setTitle('');
    setRole('resident');
  }

  return (
    <View style={{ gap: space[6] }}>
      <StepHeader title="Who lives here">
        The people Obrigada should recognise, so an unfamiliar face stands out. Add their names
        here. You will take a quick photo of each one on the guardian in the next step. Their faces
        stay on that phone and never reach us.
      </StepHeader>

      {people.length ? (
        <View style={{ gap: space[2] }}>
          {people.map((p, i) => (
            <ListRow
              key={i}
              title={p.title}
              sub={ROLE_OPTIONS.find((r) => r.value === p.role)?.label ?? p.role}
            />
          ))}
        </View>
      ) : null}

      <Card style={{ gap: space[4] }}>
        <Field
          label="Name"
          placeholder="Dad, Maria …"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
        />
        <View style={{ gap: space[2] }}>
          <Text style={s.fieldLabel}>Relationship</Text>
          <View style={s.roleRow}>
            {ROLE_OPTIONS.map((r) => (
              <SelectPill
                key={r.value}
                label={r.label}
                selected={role === r.value}
                onPress={() => setRole(r.value)}
              />
            ))}
          </View>
        </View>
        <Button
          label="Add person"
          variant="secondary"
          onPress={add}
          loading={busy}
          disabled={!title.trim()}
        />
      </Card>
    </View>
  );
}

function GuardianStep({
  pairing,
  onCreate,
  busy,
  peopleCount,
}: {
  pairing: { name: string; code: string } | null;
  onCreate: (name: string) => Promise<void>;
  busy: boolean;
  peopleCount: number;
}) {
  const [name, setName] = useState('Living room');

  return (
    <View style={{ gap: space[6] }}>
      <StepHeader title="Set up the guardian">
        Obrigada runs on a spare Android phone you place where they spend their day. Name it for the
        room it watches, then pair it.
      </StepHeader>

      {pairing ? (
        <Card style={{ gap: space[3], alignItems: 'center' }}>
          <Caption>PAIRING CODE FOR {pairing.name.toUpperCase()}</Caption>
          <Text style={s.code}>{pairing.code}</Text>
          <Body muted>On the spare phone, open Obrigada and enter this code.</Body>
        </Card>
      ) : (
        <Card style={{ gap: space[4] }}>
          <Field
            label="Guardian name"
            placeholder="Living room"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Button
            label="Create pairing code"
            variant="secondary"
            onPress={() => onCreate(name)}
            loading={busy}
            disabled={!name.trim()}
          />
        </Card>
      )}

      <Card style={{ gap: space[2], backgroundColor: color.lilac100, borderColor: color.lilac200 }}>
        <H2>Then, on the guardian</H2>
        <Body muted>
          It walks you through two things. Take a photo of each of the{' '}
          {peopleCount ? `${peopleCount} ` : ''}people you added, so Obrigada learns their faces.
          And mark any zones to keep an eye on, like a doorway or the top of the stairs. Both stay
          on that phone.
        </Body>
      </Card>
    </View>
  );
}

function DoneStep({
  familyName,
  language,
  contactsCount,
  peopleCount,
  paired,
}: {
  familyName: string;
  language: CheckinLanguage | null;
  contactsCount: number;
  peopleCount: number;
  paired: boolean;
}) {
  const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? 'set';
  return (
    <View style={{ gap: space[6] }}>
      <StepHeader title="You're covered">
        That is the essentials for {familyName}. You can change any of it from Home whenever you
        need to.
      </StepHeader>
      <Card style={{ gap: space[3] }}>
        <RecapRow ok label={`Check-in language: ${langLabel}`} />
        <RecapRow
          ok={contactsCount > 0}
          label={`${contactsCount} ${contactsCount === 1 ? 'person' : 'people'} to call`}
        />
        <RecapRow
          ok={peopleCount > 0}
          label={peopleCount ? `${peopleCount} in the household` : 'Household roster (add later)'}
        />
        <RecapRow
          ok={paired}
          label={paired ? 'Guardian paired' : 'Pair the guardian when you are ready'}
        />
      </Card>
    </View>
  );
}

/* ---- small local building blocks ---- */

function SelectCard({
  selected,
  onPress,
  title,
  sub,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  sub: string;
}) {
  return (
    <Pressable onPress={onPress} style={[s.selectCard, selected && s.selectCardOn]}>
      <View style={{ flex: 1 }}>
        <Text style={s.selectTitle}>{title}</Text>
        <Text style={s.selectSub}>{sub}</Text>
      </View>
      <View style={[s.radio, selected && s.radioOn]}>
        {selected ? <View style={s.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

function SelectPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.pill, selected && s.pillOn]}>
      <Text style={[s.pillText, selected && s.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ListRow({ index, title, sub }: { index?: number; title: string; sub: string }) {
  return (
    <View style={s.listRow}>
      {index ? <Text style={s.listIndex}>{index}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.listTitle}>{title}</Text>
        <Text style={s.listSub}>{sub}</Text>
      </View>
    </View>
  );
}

function RecapRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={s.recapRow}>
      <View style={[s.check, ok ? s.checkOn : s.checkOff]}>
        <Text style={s.checkMark}>{ok ? '✓' : '·'}</Text>
      </View>
      <Text style={s.recapLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bgCanvas },
  body: { padding: space[6], gap: space[6], paddingBottom: space[10] },

  // Welcome.
  welcome: { flex: 1, padding: space[6], justifyContent: 'space-between' },
  welcomeBody: { flex: 1, justifyContent: 'center', gap: space[4] },
  welcomeCta: { paddingBottom: space[4] },
  brand: { fontSize: text.xs, letterSpacing: 2, fontWeight: '700', color: color.textSecondary },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.textPrimary,
    lineHeight: 38,
  },

  // Progress.
  progress: { paddingHorizontal: space[6], paddingTop: space[4], gap: space[2] },
  progressBars: { flexDirection: 'row', gap: space[2] },
  progressBar: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: color.neutral100 },
  progressBarOn: { backgroundColor: color.action },

  // Footer.
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[6],
    paddingTop: space[3],
    paddingBottom: space[5],
    borderTopWidth: 1,
    borderTopColor: color.neutral75,
    backgroundColor: color.bgSurface,
  },
  back: { paddingVertical: space[3], paddingRight: space[2] },
  backText: { fontSize: text.md, fontWeight: '600', color: color.textSecondary },
  footerCta: { flex: 1 },

  fieldLabel: { fontSize: text.md, fontWeight: '600', color: color.textPrimary },

  // Select card (language).
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.bgSurface,
  },
  selectCardOn: { borderColor: color.action, backgroundColor: color.lilac100 },
  selectTitle: { fontSize: text.lg, fontWeight: '600', color: color.textPrimary },
  selectSub: { fontSize: text.sm, color: color.textSecondary, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.action },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.action },

  // Role pills.
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.bgSurface,
  },
  pillOn: { borderColor: color.action, backgroundColor: color.lilac100 },
  pillText: { fontSize: text.sm, fontWeight: '600', color: color.textSecondary },
  pillTextOn: { color: color.action },

  // List rows (contacts / people).
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: color.bgSurface,
    borderWidth: 1,
    borderColor: color.neutral75,
  },
  listIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: 'center',
    lineHeight: 26,
    fontSize: text.sm,
    fontWeight: '700',
    color: color.action,
    backgroundColor: color.lilac100,
    overflow: 'hidden',
  },
  listTitle: { fontSize: text.md, fontWeight: '600', color: color.textPrimary },
  listSub: { fontSize: text.sm, color: color.textSecondary },

  // Pairing code.
  code: { fontSize: 40, fontWeight: '700', letterSpacing: 8, color: color.textPrimary },

  // Recap.
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.success100 },
  checkOff: { backgroundColor: color.bgSunken },
  checkMark: { fontSize: text.sm, fontWeight: '700', color: color.success700 },
  recapLabel: { fontSize: text.md, color: color.textPrimary, flex: 1 },
});
