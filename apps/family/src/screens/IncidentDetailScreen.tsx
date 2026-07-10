import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAcknowledgeIncident, useIncident, useResolveIncident } from '../api/hooks';
import type { IncidentDetail, IncidentStep, SecondOpinion } from '../api/types';
import { Body, Button, Card, Caption, Chip, H1, Screen } from '../components/ui';
import { color, radius, space, text } from '../theme/tokens';
import { outcomeLabel, relativeTime, stepLabel, stepTime, type StepTone } from '../incident-format';

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
        <Caption>YOU&apos;RE HANDLING THIS</Caption>
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
      <Caption>ON YOUR WAY?</Caption>
      <Body muted>
        Tap if you&apos;re taking care of this. We&apos;ll pause the calls — then check back with
        you shortly, and resume if we don&apos;t hear an all-clear.
      </Body>
      <Button
        label="I'm handling this"
        variant="secondary"
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
      <Caption>A SECOND LOOK</Caption>
      <Body>{secondOpinionLead(opinion.verdict)}</Body>
      {details.length > 0 ? <Body muted>It noted: {details.join(', ')}.</Body> : null}
      {opinion.note ? <Body muted>{opinion.note}</Body> : null}
    </Card>
  );
}

const toneTint: Record<StepTone, string> = {
  well: color.success100,
  attention: color.attention100,
  incident: color.incident100,
};
const toneDot: Record<StepTone, string> = {
  well: color.success,
  attention: color.attention500,
  incident: color.incident500,
};

/** One ladder step as a soft row: tinted status circle, human words, time. */
function StepRow({ step }: { step: IncidentStep }) {
  const { title, subtitle, tone } = stepLabel(step);
  const time = stepTime(step.occurredAt);
  return (
    <View style={st.row}>
      <View style={[st.circle, { backgroundColor: toneTint[tone] }]}>
        <View style={[st.circleDot, { backgroundColor: toneDot[tone] }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Body>{title}</Body>
        {subtitle ? <Caption>{subtitle}</Caption> : null}
      </View>
      {time ? <Text style={st.time}>{time}</Text> : null}
    </View>
  );
}

/** The full step ladder for one incident: the append-only trail, in human words. */
export function IncidentDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const incident = useIncident(id);
  const outcome = incident.data ? outcomeLabel(incident.data.outcome) : null;

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[5] }}>
        <Pressable onPress={onBack} hitSlop={10} style={{ alignSelf: 'flex-start' }}>
          <Text style={st.back}>‹ Timeline</Text>
        </Pressable>

        <View style={{ gap: space[2] }}>
          <Caption>WHAT HAPPENED</Caption>
          <H1>{incident.data?.reason ?? 'Incident'}</H1>
          {incident.data ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              {outcome ? <Chip tone={outcome.tone}>{outcome.label}</Chip> : null}
              <Caption>{relativeTime(incident.data.openedAt)}</Caption>
            </View>
          ) : null}
        </View>

        {incident.data ? <IncidentActions id={id} incident={incident.data} /> : null}

        {incident.data?.narrative ? (
          <Card style={st.summary}>
            <Caption>IN A FEW WORDS</Caption>
            <Body>{incident.data.narrative}</Body>
          </Card>
        ) : null}

        {incident.data?.secondOpinion ? (
          <SecondOpinionCard opinion={incident.data.secondOpinion} />
        ) : null}

        {incident.isLoading ? (
          <Card>
            <Body muted>Loading the steps we took.</Body>
          </Card>
        ) : incident.isError ? (
          <Card>
            <Body muted>We could not load this incident. Pull back and try again.</Body>
          </Card>
        ) : (
          <Card style={{ gap: space[4] }}>
            {(incident.data?.steps ?? []).map((s) => (
              <StepRow key={s.seq} step={s} />
            ))}
            {incident.data && incident.data.steps.length === 0 ? (
              <Body muted>No steps recorded for this incident yet.</Body>
            ) : null}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  back: { color: color.action, fontSize: text.md, fontWeight: '600' },
  summary: { gap: space[2], backgroundColor: color.lilac100, borderColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  circle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDot: { width: 12, height: 12, borderRadius: 6 },
  time: { fontSize: text.sm, color: color.textTertiary, fontVariant: ['tabular-nums'] },
});
