// LiveKit needs native WebRTC globals, which only exist on a device. This default/web
// variant is a no-op — the live view runs on the mobile app; the web bundle shows a
// placeholder (see LiveView.tsx). The native variant (livekit-setup.native.ts) registers
// the globals. Metro resolves the right file per platform; tsc and the web bundle see this one.
export {};
