import { isTrackReference, LiveKitRoom, useTracks, VideoTrack } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveGrant } from '../api/types';
import { color, space, text } from '../theme/tokens';

/**
 * The live camera view (F2.5) — native only. Connects to the guardian's room as a view-only
 * subscriber (never publishes) and renders its camera track.
 *
 * NOTE: end-to-end encryption (decision 0010) is not wired here yet. E2EE needs the guardian
 * publish side plus a shared key, which land together; transport to the SFU is TLS-encrypted
 * meanwhile. True E2EE is a required follow-up before real families.
 */
export function LiveView({ grant }: { grant: LiveGrant }) {
  return (
    <LiveKitRoom serverUrl={grant.url} token={grant.token} connect audio={false} video={false}>
      <RemoteCamera />
    </LiveKitRoom>
  );
}

function RemoteCamera() {
  const camera = useTracks([Track.Source.Camera]).find(isTrackReference);
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
