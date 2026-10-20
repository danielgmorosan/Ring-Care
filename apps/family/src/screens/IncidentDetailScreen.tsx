import { StyleSheet, Text, View } from 'react-native';
import { useAcknowledgeIncident, useIncident, useResolveIncident } from '../api/hooks';
import type { IncidentDetail, IncidentStep, SecondOpinion } from '../api/types';
import {
  BackLink,
  Body,
  Button,
  Card,
  Caption,
  Chip,
  Icon,
  IconBadge,
  Pulse,
  Screen,
  SectionHeader,
  toneBg,
  toneDot,
  toneFg,
  type IconName,
  type Tone,
} from '../components/ui';
import { color, font, radius, space, text } from '../theme/tokens';
import { outcomeLabel, reasonInfo, relativeTime, stepLabel, stepTime } from '../incident-format';

/**
 * Caregiver actions on an active incident (decision 0008). "I'm handling this" holds
 * escalation for a short window; the caregiver must then confirm "All clear" or the ladder
 * resumes on its own. There is deliberately no one-tap cancel.
 */
function IncidentActions({ id, incident }: { id: string; incident: IncidentDetail }) {
  const acknowledge = useAcknowledgeIncident();
  const resolve = useResolveIncident();

  // Only an active (not yet resolved/escalated) incident can be acted on.
  if (incident.outcome !== 'active') return null;

  const kinds = incident.steps.map((s) => s.kind);
  const acknowledged =
    kinds.includes('caregiver_acknowledged') && !kinds.includes('acknowledgement_lapsed');

  if (acknowledged) {
    return (
      <Card style={{ gap: space[3] }}>
        <SectionHeader icon="hand" label="You're handling this" />
        <Body muted>
          Escalation is paused. Confirm all is well, or we&apos;ll pick it back up shortly to be
          safe.
        </Body>
        <Button
          label="All clear"
          onPress={() => void resolve.mutate(id)}
          loading={resolve.isPending}
        />
      </Card>
    );
  }

  return (
    <Card style={{ gap: space[3] }}>
      <SectionHeader icon="hand" label="On your way?" />
      <Body muted>
        Tap if you&apos;re taking care of this. We&apos;ll pause the calls, then check back with you
        shortly. If we don&apos;t hear an all-clear, we carry on.
      </Body>
      <Button
        label="I'm handling this"
        icon="hand"
        onPress={() => void acknowledge.mutate(id)}
        loading={acknowledge.isPending}
      />
    </Card>
  );
}

/** The VLM second opinion in human words. It never decided anything — one input among the
 * rules (rule #3, decision 0007: it may raise urgency, never stand an incident down). */
function secondOpinionLead(verdict: SecondOpinion['verdict']): string {
  switch (verdict) {
    case 'confirmed':
      return 'A second look agreed this looked like a fall.';
    case 'refuted':
      return "A second look wasn't certain it was a fall.";
    default:
      return "A second look couldn't tell for sure.";
  }
}

/** The labelled details the VLM reported, as short human phrases. */
function secondOpinionDetails(opinion: SecondOpinion): string[] {
  const details: string[] = [];
  if (opinion.onFloor === true) details.push('on the floor');
  if (opinion.walkerNearby === true) details.push('a walker was nearby');
  if (opinion.doorOpen === true) details.push('a door was open');
  return details;
}

/** Obrigada's on-device second look at the moment the incident opened (F3.1). */
function SecondOpinionCard({ opinion }: { opinion: SecondOpinion }) {
  const details = secondOpinionDetails(opinion);
  return (
    <Card style={{ gap: space[2] }}>
      <SectionHeader icon="scan-face" label="A second look" />
      <Body strong>{secondOpinionLead(opinion.verdict)}</Body>
      {details.length > 0 ? <Body muted>It noted: {details.join(', ')}.</Body> : null}
      {opinion.note ? <Body muted>{opinion.note}</Body> : null}
    </Card>
  );
}

/** The line icon for each ladder step, so the trail reads at a glance. */
function stepIcon(step: IncidentStep, reasonIcon: IconName): IconName {
  switch (step.kind) {
    case 'incident_opened':
      return reasonIcon;
    case 'voice_checkin_result':
      return 'mic';
    case 'call_placed':
      return 'phone-call';
    case 'call_answered':
      return 'phone-incoming';
    case 'call_no_answer':
      return 'phone-missed';
    case 'sms_sent':
      return 'message-square';
    case 'push_sent':
      return 'bell-ring';
    case 'quiet_hours_skipped':
      return 'moon';
    case 'emergency_notified':
      return 'siren';
    case 'caregiver_acknowledged':
      return 'hand';
    case 'acknowledgement_lapsed':
      return 'refresh-cw';
    case 'stood_down':
      return 'check-circle-2';
    default:
      return 'circle-dot';
  }
}

/** What is happening right now on an active incident: the newest step, phrased in the
 * present tense ("Calling Sofia"). Display only; the ladder itself is the backend's. */
function liveLine(steps: IncidentStep[]): { title: string; subtitle: string } | null {
  const last = steps[steps.length - 1];
  if (!last) return null;
  const who = last.contactName ?? 'the next contact';
  switch (last.kind) {
    case 'call_placed':
      return { title: `Calling ${who}…`, subtitle: 'Ringing now' };
    case 'push_sent':
      return { title: `Alerting ${who}…`, subtitle: 'Notification sent' };
    case 'sms_sent':
      return { title: `Texting ${who}…`, subtitle: 'Message sent' };
    case 'call_no_answer':
      return { title: 'Moving to the next contact', subtitle: `${who} did not answer` };
    case 'incident_opened':
      return { title: 'Checking in', subtitle: 'Starting the ladder' };
    default: {
      const { title, subtitle } = stepLabel(last);
      return { title, subtitle: subtitle ?? 'Latest step' };
    }
  }
}

/** The dark "now" card on an active incident: a breathing phone and the current step. */
function LiveStatus({ steps }: { steps: IncidentStep[] }) {
  const line = liveLine(steps);
  if (!line) return null;
  return (
    <Card dark style={st.live}>
      <View style={st.liveTag}>
        <View style={st.liveDotWrap}>
          <Pulse color={color.incident500} size={8} />
          <View style={st.liveDot} />
        </View>
        <Text style={st.liveTagText}>HAPPENING NOW</Text>
      </View>
      <View style={st.liveRow}>
        <View style={st.liveIconWrap}>
          <Pulse color={color.white55} size={56} scale={1.45} />
          <View style={st.liveIcon}>
            <Icon name="phone-call" size={26} color={color.textInverse} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.liveTitle}>{line.title}</Text>
          <Text style={st.liveSub}>{line.subtitle}</Text>
        </View>
      </View>
    </Card>
  );
}

const ROUTINE = new Set(['call_placed', 'push_sent', 'sms_sent']);

/** One ladder step: a tinted icon on the rail, human words, the clock time. */
function StepRow({
  step,
  reasonIcon,
  first,
  last,
  current,
}: {
  step: IncidentStep;
  reasonIcon: IconName;
  first: boolean;
  last: boolean;
  current: boolean;
}) {
  const label = stepLabel(step);
  const { title, subtitle } = label;
  // Routine outreach (we alerted, we called) reads calm and neutral; amber is kept for the
  // steps that need a second glance, like a missed call.
  const tone: Tone =
    label.tone === 'attention' && ROUTINE.has(step.kind) && !current ? 'neutral' : label.tone;
  const time = stepTime(step.occurredAt);
  const meta = subtitle ?? '';
  return (
    <View style={st.row} accessible accessibilityLabel={`${time ?? ''} ${title}. ${meta}`}>
      <View style={st.rail}>
        <View style={[st.railLine, first && st.railHidden]} />
        <View style={[st.circle, { backgroundColor: toneBg[tone] }]}>
          {current ? <Pulse color={toneDot[tone]} size={RAIL} scale={1.4} /> : null}
          <Icon
            name={stepIcon(step, reasonIcon)}
            size={19}
            color={toneFg[tone]}
            strokeWidth={2.2}
          />
        </View>
        <View style={[st.railLine, st.railFill, last && st.railHidden]} />
      </View>
      <View style={st.rowBody}>
        <View style={st.rowHead}>
          <Text style={st.stepTitle}>{title}</Text>
          {time ? (
            <Text style={[st.time, current && st.timeNow]}>{current ? 'Now' : time}</Text>
          ) : null}
        </View>
        {meta ? <Text style={st.stepMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

/** The full step ladder for one incident: the append-only trail, in human words. */
export function IncidentDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const incident = useIncident(id);
  const outcome = incident.data ? outcomeLabel(incident.data.outcome) : null;
  const reason = incident.data ? reasonInfo(incident.data.reason) : null;
  const steps = incident.data?.steps ?? [];
  const active = incident.data?.outcome === 'active';

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <BackLink label="Timeline" onPress={onBack} />

        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            {reason ? <IconBadge icon={reason.icon} tone={reason.tone} size={56} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.eyebrow}>What happened</Text>
              <Text style={st.title} accessibilityRole="header">
                {reason?.label ?? 'Incident'}
              </Text>
            </View>
          </View>
          {reason?.source ? <Body muted>{reason.source}</Body> : null}
          {incident.data ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              {outcome ? (
                <Chip tone={outcome.tone} dot>
                  {outcome.label}
                </Chip>
              ) : null}
              <Caption>{relativeTime(incident.data.openedAt)}</Caption>
            </View>
          ) : null}
        </View>

        {active ? <LiveStatus steps={steps} /> : null}

        {incident.data ? <IncidentActions id={id} incident={incident.data} /> : null}

        {incident.isLoading ? (
          <Card>
            <Body muted>Loading the steps we took.</Body>
          </Card>
        ) : incident.isError ? (
          <Card style={{ gap: space[3] }}>
            <Body muted>We couldn&apos;t load this incident just now.</Body>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void incident.refetch()}
              loading={incident.isFetching}
            />
          </Card>
        ) : (
          <View style={{ gap: space[3] }}>
            <SectionHeader
              icon="list-checks"
              label="Every step we took"
              right={
                <Text
                  style={st.count}
                >{`${steps.length} step${steps.length === 1 ? '' : 's'}`}</Text>
              }
            />
            <Card style={st.ladder}>
              {steps.map((s, i) => (
                <StepRow
                  key={s.seq}
                  step={s}
                  reasonIcon={reason?.icon ?? 'circle-dot'}
                  first={i === 0}
                  last={i === steps.length - 1}
                  current={active && i === steps.length - 1}
                />
              ))}
              {incident.data && steps.length === 0 ? (
                <Body muted>No steps recorded for this incident yet.</Body>
              ) : null}
            </Card>
          </View>
        )}

        {incident.data?.narrative ? (
          <Card style={st.summary}>
            <SectionHeader icon="sparkles" label="In a few words" />
            <Text style={st.narrative}>{incident.data.narrative}</Text>
          </Card>
        ) : null}

        {incident.data?.secondOpinion ? (
          <SecondOpinionCard opinion={incident.data.secondOpinion} />
        ) : null}
      </View>
    </Screen>
  );
}

const RAIL = 44;
const st = StyleSheet.create({
  eyebrow: { ...font.medium, fontSize: text.sm, color: color.textTertiary },
  title: {
    ...font.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: color.textPrimary,
  },
  count: { ...font.semibold, fontSize: text.sm, color: color.textPrimary },
  summary: { gap: space[3], backgroundColor: color.bgSurface },
  narrative: { ...font.regular, fontSize: 17, lineHeight: 26, color: color.textPrimary },
  ladder: { paddingVertical: space[3], paddingHorizontal: space[4] },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: space[3] },
  rail: { width: RAIL, alignItems: 'center' },
  railLine: { width: 2, height: 10, backgroundColor: color.borderStrong },
  railFill: { flex: 1, minHeight: 10 },
  railHidden: { backgroundColor: 'transparent' },
  circle: {
    width: RAIL,
    height: RAIL,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, paddingTop: 10 + 11, paddingBottom: space[4], gap: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  stepTitle: {
    ...font.semibold,
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: color.textPrimary,
  },
  stepMeta: { ...font.regular, fontSize: 14, lineHeight: 19, color: color.textSecondary },
  time: {
    ...font.medium,
    fontSize: 15,
    lineHeight: 22,
    color: color.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  timeNow: { ...font.bold, color: color.incident700 },
  live: { gap: space[4], borderRadius: radius.xl, padding: space[6] },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.incident500 },
  liveTagText: { ...font.semibold, fontSize: 12, letterSpacing: 1.6, color: color.white75 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  liveIconWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  liveIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTitle: {
    ...font.bold,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: color.textInverse,
  },
  liveSub: { ...font.regular, fontSize: 15, color: color.white75 },
});
