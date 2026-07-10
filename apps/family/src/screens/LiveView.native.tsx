import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveGrant } from '../api/types';
import { color, space, text } from '../theme/tokens';

/**
 * The live camera view (F2.5) — native only. LiveKit's native module is loaded lazily so that
 * merely importing this screen never crashes where the module is absent (e.g. Expo Go); there
 * it shows a short note instead. A real dev build has the module and renders live video.
 *
 * NOTE: end-to-end encryption (decision 0010) is not wired here yet — it lands with the
 * guardian publish side plus a shared key. Transport to the SFU is TLS-encrypted meanwhile.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadLiveKit(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@livekit/react-native');
  } catch {
    return null;
  }
}

export function LiveView({ grant }: { grant: LiveGrant }) {
  const lk = useMemo(loadLiveKit, []);
  if (!lk) {
    return (
      <View style={s.box}>
        <Text style={s.waiting}>Live video needs the full app build (not Expo Go).</Text>
      </View>
    );
  }
  const { LiveKitRoom } = lk;
  return (
    <LiveKitRoom serverUrl={grant.url} token={grant.token} connect audio={false} video={false}>
      <RemoteCamera lk={lk} />
    </LiveKitRoom>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RemoteCamera({ lk }: { lk: any }) {
  const { useTracks, isTrackReference, VideoTrack } = lk;
  // Source string 'camera' avoids importing livekit-client's Track enum at module load.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const camera = useTracks(['camera']).find((t: any) => isTrackReference(t));
  if (!camera) {
    return (
      <View style={s.box}>
        <Text style={s.waiting}>Waiting for the guardian&apos;s camera…</Text>
      </View>
    );
  }
  return <VideoTrack trackRef={camera} style={s.fill} objectFit="cover" />;
}

const s = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6] },
  waiting: { color: color.white75, fontSize: text.md, textAlign: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
