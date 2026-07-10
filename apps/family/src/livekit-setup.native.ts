// Register the native WebRTC globals LiveKit needs — but only when the native module is
// actually present. In Expo Go it is absent, so we swallow the error and live video stays
// disabled; everything else in the app still works. A real dev build has the module and this
// runs for real. Native only (Metro picks this over livekit-setup.ts on device).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const livekit = require('@livekit/react-native') as { registerGlobals: () => void };
  livekit.registerGlobals();
} catch (err) {
  void err; // Expo Go: LiveKit native module absent; live video disabled.
}

export {};
