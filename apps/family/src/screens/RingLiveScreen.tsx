import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RingCamera } from '../api/types';
import { useRingLiveSession } from '../ring-live';
import { color, radius, space, text } from '../theme/tokens';
import { createRingPeer, RingLiveVideo } from './RingLiveView';

/** Elapsed live time as "0:42". */
function elapsed(since: number | null, now: number): string {
  if (since === null) return '0:00';
  const total = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Full-screen Ring live view (decision 0011). A window, not a recorder: nothing is saved,
 * and every open is audit-logged on the backend (rule #7). Ring ends live sessions after
 * about a minute, so an ended session is a normal, calm state with a one-tap restart.
 */
export function RingLiveScreen({ camera, onClose }: { camera: RingCamera; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const { phase, stream, error, liveSince } = useRingLiveSession(
    camera.id,
    attempt,
    createRingPeer,
  );

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.shell}>
        <View style={s.stage}>
          {stream && phase === 'live' ? <RingLiveVideo stream={stream} muted={muted} /> : null}

          {phase === 'connecting' ? (
            <Centered>
              <ActivityIndicator color={color.textInverse} />
              <Text style={s.title}>Connecting to {camera.name}</Text>
              <Text style={s.dim}>Asking Ring for a live picture.</Text>
            </Centered>
          ) : phase === 'ended' ? (
            <Centered>
              <Text style={s.title}>Live view ended</Text>
              <Text style={s.dim}>
                Ring closes live view after about a minute. Nothing was saved.
              </Text>
              <PillButton label="Watch again" onPress={retry} />
            </Centered>
          ) : phase === 'error' ? (
            <Centered>
              <Text style={s.title}>We couldn&apos;t open the camera</Text>
              <Text style={s.dim}>{error ?? 'Ring did not start the live view.'}</Text>
              <PillButton label="Try again" onPress={retry} />
            </Centered>
          ) : phase === 'live' && !stream ? (
            <Centered>
              <ActivityIndicator color={color.textInverse} />
              <Text style={s.dim}>Waiting for the picture.</Text>
            </Centered>
          ) : null}
        </View>

        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.liveTag}>
            <View style={[s.liveDot, phase !== 'live' && s.liveDotIdle]} />
            <Text style={s.liveText}>
              {phase === 'live' ? `Live from Ring · ${elapsed(liveSince, now)}` : 'Live from Ring'}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={s.chipBtn}
            accessibilityRole="button"
            accessibilityLabel="Close live view"
          >
            <Text style={s.chipText}>Close</Text>
          </Pressable>
        </View>

        <View style={s.bottomBar} pointerEvents="box-none">
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.cameraName}>{camera.name}</Text>
            <Text style={s.note}>Ring live view ends after about a minute.</Text>
          </View>
          {phase === 'live' ? (
            <Pressable
              onPress={() => setMuted((m) => !m)}
              hitSlop={12}
              style={s.chipBtn}
              accessibilityRole="button"
            >
              <Text style={s.chipText}>{muted ? 'Sound on' : 'Mute'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={s.centered}>{children}</View>;
}

function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.pill} accessibilityRole="button">
      <Text style={s.pillText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#000' },
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[6],
  },
  title: { color: color.textInverse, fontSize: text.lg, fontWeight: '600', textAlign: 'center' },
  dim: { color: color.white75, fontSize: text.md, textAlign: 'center', maxWidth: 320 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space[10],
    paddingHorizontal: space[5],
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[8],
    backgroundColor: color.black35,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: color.black60,
    paddingVertical: 6,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.incident500 },
  liveDotIdle: { backgroundColor: color.white55 },
  liveText: {
    color: color.textInverse,
    fontSize: text.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  chipBtn: {
    backgroundColor: color.black60,
    paddingVertical: 8,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
  },
  chipText: { color: color.textInverse, fontSize: text.sm, fontWeight: '600' },
  cameraName: { color: color.textInverse, fontSize: text.md, fontWeight: '600' },
  note: { color: color.white75, fontSize: text.xs },
  pill: {
    marginTop: space[2],
    backgroundColor: color.white20,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: space[6],
  },
  pillText: { color: color.textInverse, fontSize: text.md, fontWeight: '600' },
});
