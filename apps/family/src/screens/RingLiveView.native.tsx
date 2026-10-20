import {
  MediaStream,
  RTCPeerConnection,
  RTCView,
  type MediaStreamTrack,
} from '@livekit/react-native-webrtc';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { waitForIceGathering, type WhepPeer } from '../ring-live';

/**
 * Ring live view, native build. Mirrors RingLiveView.tsx using @livekit/react-native-webrtc
 * (already a dependency for the guardian live view). Receive-only: nothing is published.
 */
export type RingStream = MediaStream;

export function createRingPeer(): WhepPeer<RingStream> {
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
  let closed = false;
  const tracks: MediaStreamTrack[] = [];

  return {
    async createOffer() {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const offer = (await pc.createOffer({})) as { type: 'offer'; sdp: string };
      await pc.setLocalDescription(offer);
      await waitForIceGathering(() => pc.iceGatheringState === 'complete');
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error('No local description');
      return sdp;
    },
    async accept(sdpAnswer) {
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
    },
    onStream(cb) {
      pc.addEventListener('track', (e) => {
        const [first] = e.streams;
        if (first) {
          cb(first);
          return;
        }
        if (!e.track) return;
        // Ring may send tracks without a stream id; gather them into one stream.
        tracks.push(e.track);
        cb(new MediaStream(tracks));
      });
    },
    onConnectionState(cb) {
      pc.addEventListener('connectionstatechange', () => cb(pc.connectionState));
    },
    close() {
      if (closed) return;
      closed = true;
      pc.close();
    },
  };
}

/** The live picture. Sound plays through the device; the toggle enables or mutes the
 * audio track. */
export function RingLiveVideo({ stream, muted }: { stream: RingStream; muted: boolean }) {
  useEffect(() => {
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [stream, muted]);

  return <RTCView streamURL={stream.toURL()} style={s.fill} objectFit="contain" />;
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
