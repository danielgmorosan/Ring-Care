import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLiveToken } from '../api/hooks';
import { color, radius, space, text } from '../theme/tokens';
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
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE · {guardianName}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <Text style={s.closeText}>Close</Text>
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
  dim: { color: color.white75, fontSize: text.md, textAlign: 'center' },
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
  liveText: { color: color.textInverse, fontSize: text.xs, fontWeight: '700', letterSpacing: 1 },
  closeBtn: {
    backgroundColor: color.black60,
    paddingVertical: 8,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
  },
  closeText: { color: color.textInverse, fontSize: text.sm, fontWeight: '600' },
});
