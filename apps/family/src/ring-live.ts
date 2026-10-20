import { useEffect, useState } from 'react';
import { startRingLive, stopRingLive } from './api/hooks';

/**
 * Ring live view over WHEP (decision 0011). Receive-only: we never send media to Ring. The
 * backend relays the SDP offer and answer (Ring blocks browser calls) and audit-logs the
 * open (rule #7); the media flows from Ring to this device and is never recorded.
 *
 * The platform files (RingLiveView.tsx for web, RingLiveView.native.tsx on device) each
 * implement a WhepPeer over their own RTCPeerConnection. This hook owns the lifecycle.
 */
export interface WhepPeer<S> {
  /** Add recvonly audio + video transceivers, create the offer, set it locally and wait
   * for ICE gathering to finish (WHEP without trickle). Resolves to the full offer SDP. */
  createOffer(): Promise<string>;
  /** Apply Ring's SDP answer. */
  accept(sdpAnswer: string): Promise<void>;
  /** Called with the remote stream as tracks arrive. */
  onStream(cb: (stream: S) => void): void;
  /** Called with the RTCPeerConnection connectionState. */
  onConnectionState(cb: (state: string) => void): void;
  close(): void;
}

export type RingLivePhase = 'connecting' | 'live' | 'ended' | 'error';

/** How long to wait for ICE gathering before sending the offer with what we have. */
export const ICE_GATHER_TIMEOUT_MS = 2500;
/** How long a connection may take before we call it failed. */
const CONNECT_TIMEOUT_MS = 20000;
/** A brief "disconnected" can recover on its own; wait this long before calling it ended. */
const DISCONNECT_GRACE_MS = 3000;

/** Resolve once `isComplete()` is true, polling. Plain polling keeps both RTCPeerConnection
 * implementations (browser and native) behind the same tiny interface. */
export function waitForIceGathering(
  isComplete: () => boolean,
  timeoutMs: number = ICE_GATHER_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    if (isComplete()) {
      resolve();
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (isComplete() || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function friendlyError(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  if (/not found|404/i.test(message)) return 'Ring could not find this camera.';
  if (/offline/i.test(message)) return 'The camera is offline right now.';
  if (/network|fetch/i.test(message)) return 'We could not reach Obrigada. Check your connection.';
  return 'Ring did not start the live view.';
}

/**
 * One live view session, tied to the component's lifetime. `attempt` restarts it (retry).
 * On unmount or retry the peer is closed and the session is ended on the backend.
 */
export function useRingLiveSession<S>(
  cameraId: string,
  attempt: number,
  createPeer: () => WhepPeer<S>,
): { phase: RingLivePhase; stream: S | null; error: string | null; liveSince: number | null } {
  const [phase, setPhase] = useState<RingLivePhase>('connecting');
  const [stream, setStream] = useState<S | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSince, setLiveSince] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sessionId: string | null = null;
    let wasLive = false;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

    setPhase('connecting');
    setStream(null);
    setError(null);
    setLiveSince(null);

    const peer = createPeer();

    const connectTimer = setTimeout(() => {
      if (cancelled || wasLive) return;
      setError('Ring did not answer in time.');
      setPhase('error');
      peer.close();
    }, CONNECT_TIMEOUT_MS);

    const finish = () => {
      if (cancelled) return;
      clearTimeout(connectTimer);
      if (wasLive) {
        setPhase('ended');
      } else {
        setError('The connection to Ring dropped.');
        setPhase('error');
      }
    };

    peer.onStream((s) => {
      if (!cancelled) setStream(s);
    });

    peer.onConnectionState((state) => {
      if (cancelled) return;
      if (state === 'connected') {
        if (disconnectTimer) clearTimeout(disconnectTimer);
        disconnectTimer = null;
        clearTimeout(connectTimer);
        if (!wasLive) {
          wasLive = true;
          setLiveSince(Date.now());
        }
        setPhase('live');
      } else if (state === 'disconnected') {
        if (disconnectTimer) clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(finish, DISCONNECT_GRACE_MS);
      } else if (state === 'failed' || state === 'closed') {
        finish();
      }
    });

    void (async () => {
      try {
        const offer = await peer.createOffer();
        if (cancelled) return;
        const session = await startRingLive(cameraId, offer);
        sessionId = session.sessionId;
        if (cancelled) {
          void stopRingLive(cameraId, session.sessionId).catch(() => undefined);
          return;
        }
        await peer.accept(session.sdpAnswer);
      } catch (e) {
        if (cancelled) return;
        clearTimeout(connectTimer);
        setError(friendlyError(e));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      if (disconnectTimer) clearTimeout(disconnectTimer);
      peer.close();
      // End the session on our side too, so the backend's audit trail records the close.
      if (sessionId) void stopRingLive(cameraId, sessionId).catch(() => undefined);
    };
  }, [cameraId, attempt, createPeer]);

  return { phase, stream, error, liveSince };
}
