import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RingCamera } from '../api/types';
import { Icon, Pulse, type IconName } from '../components/ui';
import { useRingLiveSession } from '../ring-live';
import { color, font, gradient, radius, space, text } from '../theme/tokens';
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
        <LinearGradient colors={gradient.camera} style={s.stage} />
        <View style={s.stage}>
          {stream && phase === 'live' ? <RingLiveVideo stream={stream} muted={muted} /> : null}

          {phase === 'connecting' ? (
            <Centered icon="video" busy>
              <Text style={s.title}>Connecting to {camera.name}</Text>
              <Text style={s.dim}>Asking Ring for a live picture.</Text>
            </Centered>
          ) : phase === 'ended' ? (
            <Centered icon="video">
              <Text style={s.title}>Live view ended</Text>
              <Text style={s.dim}>
                Ring closes live view after about a minute. Nothing was saved.
              </Text>
              <PillButton label="Watch again" onPress={retry} />
            </Centered>
          ) : phase === 'error' ? (
            <Centered icon="camera">
              <Text style={s.title}>We couldn&apos;t open the camera</Text>
              <Text style={s.dim}>{error ?? 'Ring did not start the live view.'}</Text>
              <PillButton label="Try again" onPress={retry} />
            </Centered>
          ) : phase === 'live' && !stream ? (
            <Centered icon="video" busy>
              <Text style={s.dim}>Waiting for the picture.</Text>
            </Centered>
          ) : null}
        </View>

        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.liveTag}>
            <View style={s.liveDotWrap}>
              {phase === 'live' ? <Pulse color={color.incident500} size={8} /> : null}
              <View style={[s.liveDot, phase !== 'live' && s.liveDotIdle]} />
            </View>
            {phase === 'live' ? (
              <>
                <Text style={s.liveText}>LIVE</Text>
                <View style={s.liveSep} />
                <Text style={s.liveText}>{elapsed(liveSince, now)}</Text>
              </>
            ) : (
              <Text style={s.liveText}>Ring live view</Text>
            )}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={s.roundBtn}
            accessibilityRole="button"
            accessibilityLabel="Close live view"
          >
            <Icon name="x" size={22} color={color.textInverse} />
          </Pressable>
        </View>

        <View style={s.bottomBar} pointerEvents="box-none">
          <View style={s.bottomTag}>
            <View style={[s.liveDot, phase !== 'live' && s.liveDotIdle]} />
            <Text style={[s.bottomTagText, phase !== 'live' && s.bottomTagIdle]}>
              {phase === 'live' ? 'LIVE' : 'RING'}
            </Text>
          </View>
          <View style={s.bottomSep} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.cameraName}>{camera.name}</Text>
            <Text style={s.note}>Ring live view ends after about a minute.</Text>
          </View>
          {phase === 'live' ? (
            <Pressable
              onPress={() => setMuted((m) => !m)}
              hitSlop={12}
              style={s.roundBtn}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Sound on' : 'Mute'}
            >
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} color={color.textInverse} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Centered({
  children,
  icon,
  busy,
}: {
  children: ReactNode;
  icon: IconName;
  busy?: boolean;
}) {
  return (
    <View style={s.centered}>
      <View style={s.orb}>
        {busy ? (
          <ActivityIndicator color={color.textInverse} />
        ) : (
          <Icon name={icon} size={28} color={color.textInverse} />
        )}
      </View>
      {children}
    </View>
  );
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
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: space[2],
    backgroundColor: color.white10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...font.semibold,
    color: color.textInverse,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  dim: {
    ...font.regular,
    color: color.white75,
    fontSize: text.md,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 320,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space[8],
    paddingHorizontal: space[5],
  },
  bottomBar: {
    position: 'absolute',
    left: space[4],
    right: space[4],
    bottom: space[8],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(20,20,20,0.82)',
  },
  bottomTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomTagText: { ...font.bold, fontSize: 13, letterSpacing: 1.6, color: color.incident500 },
  bottomTagIdle: { color: color.white75 },
  bottomSep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: color.white20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.incident500 },
  liveDotIdle: { backgroundColor: color.white55 },
  liveSep: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.3)' },
  liveText: {
    ...font.semibold,
    color: color.textInverse,
    fontSize: 13,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.white20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraName: { ...font.semibold, color: color.textInverse, fontSize: 17 },
  note: { ...font.regular, color: color.white75, fontSize: 13 },
  pill: {
    marginTop: space[2],
    backgroundColor: color.bgSurface,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space[6],
  },
  pillText: { ...font.semibold, color: color.textPrimary, fontSize: text.md },
});
