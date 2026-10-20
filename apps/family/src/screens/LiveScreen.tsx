import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLiveToken } from '../api/hooks';
import { Icon, Pulse } from '../components/ui';
import { color, font, gradient, radius, space, text } from '../theme/tokens';
import { LiveView } from './LiveView';

/**
 * The full-screen live-camera overlay (F2.5). Requests a view-only token for the guardian
 * and shows its stream. The "LIVE" tag is always visible so it is clear the camera is open
 * (and every open is logged server-side, rule #7). Closing tears the connection down.
 */
export function LiveScreen({
  deviceId,
  guardianName,
  onClose,
}: {
  deviceId: string;
  guardianName: string;
  onClose: () => void;
}) {
  const live = useLiveToken();

  const open = live.mutate;
  useEffect(() => {
    // Open once per guardian. `open` (react-query's mutate) is stable across renders.
    open(deviceId);
  }, [deviceId, open]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.shell}>
        <LinearGradient colors={gradient.camera} style={s.stage} />
        <View style={s.stage}>
          {live.isPending ? (
            <Centered>
              <ActivityIndicator color={color.textInverse} />
              <Text style={s.dim}>Connecting to {guardianName}…</Text>
            </Centered>
          ) : live.isError ? (
            <Centered>
              <Text style={s.dim}>
                Could not open the camera. {(live.error as Error)?.message ?? ''}
              </Text>
            </Centered>
          ) : live.data ? (
            <LiveView grant={live.data} />
          ) : null}
        </View>

        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.liveTag}>
            <View style={s.liveDotWrap}>
              <Pulse color={color.incident500} size={8} />
              <View style={s.liveDot} />
            </View>
            <Text style={s.liveText}>LIVE</Text>
            <View style={s.liveSep} />
            <Text style={s.liveText}>{guardianName}</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={s.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close live view"
          >
            <Icon name="x" size={22} color={color.textInverse} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={s.centered}>{children}</View>;
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
  dim: { ...font.regular, color: color.white75, fontSize: text.md, textAlign: 'center' },
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
  liveSep: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.3)' },
  liveText: { ...font.semibold, color: color.textInverse, fontSize: 13, letterSpacing: 1 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.white20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
