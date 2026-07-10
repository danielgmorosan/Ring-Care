export const motion = {
  durationMs: {
    instant: 120,
    fast: 180,
    normal: 260,
    slow: 360
  },
  easing: {
    standard: [0.22, 0.66, 0.22, 1],
    emphasized: [0.16, 1, 0.3, 1],
    smoothExit: [0.4, 0, 0.2, 1]
  },
  loading: {
    shimmerMs: 1200,
    pulseMs: 900,
    sweepMs: 1700
  }
} as const;

export type Motion = typeof motion;
