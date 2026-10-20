import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApproveProposal, useCareProposals, useRejectProposal } from '../api/hooks';
import type { ApproveResult, CareProposal, ProposalItem, ProposalItemKind } from '../api/types';
import { useAuth } from '../auth-state';
import { Body, Button, Caption, Card, Checkbox, Chip, H2, IconBadge } from '../components/ui';
import { stepTime } from '../incident-format';
import { color, space, text } from '../theme/tokens';

type Tone = 'neutral' | 'well' | 'attention' | 'incident' | 'accent';

const KIND: Record<ProposalItemKind, { label: string; glyph: string; tone: Tone }> = {
  medication_change: { label: 'Medication change', glyph: '℞', tone: 'attention' },
  new_medication: { label: 'New medication', glyph: '+', tone: 'accent' },
  appointment: { label: 'Appointment', glyph: '◷', tone: 'neutral' },
  todo: { label: 'To do', glyph: '✓', tone: 'well' },
  note: { label: 'Note', glyph: '✎', tone: 'neutral' },
};

/** "Sofia" from sofia.m@example.com, for "From Sofia's Bee". Null when it doesn't look like
 * a name, so the header falls back to "your Bee". */
function firstNameFromEmail(email: string | undefined): string | null {
  const local = email?.split('@')[0]?.split(/[._+-]/)[0] ?? '';
  if (!/^[a-zA-ZÀ-ſ]{2,}$/.test(local)) return null;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

/** "14:32" today, or "Tue 14:32" for an older note. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = stepTime(iso) ?? '';
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

interface Outcome {
  kind: 'approved' | 'rejected';
  proposal: CareProposal;
  result?: ApproveResult;
  approvedItems?: ProposalItem[];
}

/**
 * The Bee inbox (decision 0012): suggestions drawn from the caregiver's own voice notes.
 * Nothing changes the care plan until the caregiver ticks it and approves.
 */
export function CareProposals() {
  const { session } = useAuth();
  const proposals = useCareProposals('pending');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const name = firstNameFromEmail(session?.user.email);
  const owner = name ? `${name}'s Bee` : 'your Bee';

  const decidedIds = new Set(outcomes.map((o) => o.proposal.id));
  const pending = (proposals.data ?? []).filter((p) => !decidedIds.has(p.id));

  const dismiss = (id: string) => setOutcomes((list) => list.filter((o) => o.proposal.id !== id));

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        <Caption>FROM YOUR VOICE NOTES</Caption>
        <View style={st.row}>
          <H2>To review</H2>
          {pending.length > 0 ? <Chip tone="accent">{`${pending.length} new`}</Chip> : null}
        </View>
      </View>

      {outcomes.map((o) => (
        <OutcomeCard key={o.proposal.id} outcome={o} onDone={() => dismiss(o.proposal.id)} />
      ))}

      {proposals.isLoading ? (
        <Card>
          <Body muted>Checking for new notes.</Body>
        </Card>
      ) : proposals.isError ? (
        <Card style={{ gap: space[3] }}>
          <Body muted>We couldn&apos;t load your notes just now.</Body>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void proposals.refetch()}
            loading={proposals.isFetching}
          />
        </Card>
      ) : pending.length === 0 && outcomes.length === 0 ? (
        <Card style={{ gap: space[2] }}>
          <Body>Nothing to review.</Body>
          <Body muted>
            After a visit, tell your Bee what changed. We&apos;ll turn it into suggestions here.
            Nothing changes until you approve it.
          </Body>
        </Card>
      ) : (
        pending.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            owner={owner}
            onDecided={(o) => setOutcomes((list) => [o, ...list])}
          />
        ))
      )}
    </View>
  );
}

function ProposalCard({
  proposal,
  owner,
  onDecided,
}: {
  proposal: CareProposal;
  owner: string;
  onDecided: (outcome: Outcome) => void;
}) {
  const approve = useApproveProposal();
  const reject = useRejectProposal();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(proposal.items.map((i) => i.id)),
  );
  const busy = approve.isPending || reject.isPending;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onApprove() {
    const itemIds = proposal.items.filter((i) => selected.has(i.id)).map((i) => i.id);
    try {
      const result = await approve.mutateAsync({ id: proposal.id, itemIds });
      onDecided({
        kind: 'approved',
        proposal,
        result,
        approvedItems: proposal.items.filter((i) => selected.has(i.id)),
      });
    } catch {
      // The error state is shown below the buttons.
    }
  }

  async function onReject() {
    try {
      await reject.mutateAsync(proposal.id);
      onDecided({ kind: 'rejected', proposal });
    } catch {
      // The error state is shown below the buttons.
    }
  }

  return (
    <Card style={{ gap: space[4] }}>
      <View style={st.row}>
        <IconBadge glyph="◎" tone="accent" />
        <View style={{ flex: 1 }}>
          <Body>{`From ${owner}, ${whenLabel(proposal.createdAt)}`}</Body>
          <Caption>Tick what you want to keep.</Caption>
        </View>
      </View>

      {proposal.summary ? <Body muted>{proposal.summary}</Body> : null}

      <View style={{ gap: space[3] }}>
        {proposal.items.map((item) => {
          const kind = KIND[item.kind];
          const checked = selected.has(item.id);
          return (
            <View key={item.id} style={[st.item, !checked && st.itemOff]}>
              <Checkbox checked={checked} onToggle={() => toggle(item.id)} label={item.title} />
              <IconBadge glyph={kind.glyph} tone={kind.tone} size={32} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.kind}>{kind.label}</Text>
                <Body>{item.title}</Body>
                {item.detail ? <Body muted>{item.detail}</Body> : null}
              </View>
            </View>
          );
        })}
      </View>

      <Button
        label={
          selected.size === proposal.items.length
            ? 'Approve all'
            : `Approve ${selected.size} selected`
        }
        onPress={() => void onApprove()}
        loading={approve.isPending}
        disabled={busy || selected.size === 0}
      />
      <Button
        label="Reject"
        variant="ghost"
        onPress={() => void onReject()}
        loading={reject.isPending}
        disabled={busy}
      />
      {approve.isError || reject.isError ? (
        <Caption>We couldn&apos;t save that. Nothing has changed. Try again in a moment.</Caption>
      ) : null}
    </Card>
  );
}

/** What changed after a decision. Stays until the caregiver taps Done. */
function OutcomeCard({ outcome, onDone }: { outcome: Outcome; onDone: () => void }) {
  if (outcome.kind === 'rejected') {
    return (
      <Card style={{ gap: space[3] }}>
        <Body>Set aside. Nothing changed in the care plan.</Body>
        <Button label="Done" variant="ghost" onPress={onDone} />
      </Card>
    );
  }

  const items = outcome.approvedItems ?? [];
  const applied = outcome.result?.applied ?? [];
  // The backend reports applied items; show their titles when the ids match ours.
  const lines =
    applied.length > 0
      ? applied.map((a) => outcome.proposal.items.find((i) => i.id === a)?.title ?? a)
      : items.map((i) => i.title);
  const todos = outcome.result?.todosCreated ?? 0;

  return (
    <Card style={[{ gap: space[3] }, st.success]}>
      <View style={st.row}>
        <IconBadge glyph="✓" tone="well" />
        <View style={{ flex: 1 }}>
          <Body>Added to the care plan</Body>
        </View>
      </View>
      <View style={{ gap: space[1] }}>
        {lines.map((line, i) => (
          <Body key={`${line}-${i}`} muted>{`• ${line}`}</Body>
        ))}
      </View>
      {todos > 0 ? (
        <Chip tone="well">
          {todos === 1 ? 'Reminder sent to your watch' : `${todos} reminders sent to your watch`}
        </Chip>
      ) : null}
      <Button label="Done" variant="ghost" onPress={onDone} />
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  itemOff: { opacity: 0.55 },
  kind: { fontSize: text.xs, fontWeight: '600', color: color.textTertiary, letterSpacing: 0.3 },
  success: { backgroundColor: color.success100, borderColor: 'transparent' },
});
