import { createElement, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { waitForIceGathering, type WhepPeer } from '../ring-live';

/**
 * Ring live view, web build. The browser's own RTCPeerConnection plays Ring's WHEP stream
 * into a <video>. The native build (RingLiveView.native.tsx) mirrors this with
 * @livekit/react-native-webrtc; Metro picks it on device, tsc and the web bundle see this.
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
      const offer = await pc.createOffer();
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

/** The live picture. Starts muted (browsers block sound without a gesture); the screen's
 * sound toggle turns it on. */
export function RingLiveVideo({ stream, muted }: { stream: RingStream; muted: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return (
    <View style={s.fill}>
      {createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted: true,
        style: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
      })}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
