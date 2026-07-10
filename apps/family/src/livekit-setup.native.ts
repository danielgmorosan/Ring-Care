import { registerGlobals } from '@livekit/react-native';

// Register the native WebRTC globals LiveKit needs. Must run once, before any LiveKit use,
// so it is imported for its side effect from the app root. Native only (iOS/Android via a
// dev client; not Expo Go).
registerGlobals();

export {};
