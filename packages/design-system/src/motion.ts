export const motion = {
  durationMs: {
    instant: 120,
    fast: 180,
    normal: 260,
    slow: 360,
    slide: 450
  },
  easing: {
    standard: [0.22, 0.66, 0.22, 1],
    emphasized: [0.16, 1, 0.3, 1],
    // NestHome's iOS-style deceleration (screen transitions, 450ms).
    deceleration: [0.32, 0.72, 0, 1],
    smoothExit: [0.4, 0, 0.2, 1]
  },
  loading: {
    shimmerMs: 1200,
    pulseMs: 900,
    // The breathing ring on live and in-progress states.
    livePulseMs: 1800,
    sweepMs: 1700
  }
} as const;

export type Motion = typeof motion;
