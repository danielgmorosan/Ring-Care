import { colors } from './colors';

export type GradientStop = {
  readonly color: string;
  readonly location: number;
};

export type GradientToken = readonly GradientStop[];

export const gradients = {
  // Primary actions are solid ink now; kept as a two-stop token for callers that expect one.
  primaryCta: [
    { color: '#2B2B2B', location: 0 },
    { color: colors.brand.ink, location: 1 }
  ],
  // NestHome's cover fade: deep blue rising from the bottom of a photo.
  coverFade: [
    { color: 'rgba(19,16,87,0)', location: 0.35 },
    { color: 'rgba(19,16,87,0.55)', location: 0.7 },
    { color: 'rgba(2,30,241,0.85)', location: 1 }
  ],
  heroAura: [
    { color: '#EEF8EF', location: 0 },
    { color: colors.neutral[0], location: 1 }
  ],
  frostedTop: [
    { color: colors.alpha.white90, location: 0 },
    { color: colors.alpha.white55, location: 1 }
  ],
  darkScanFade: [
    { color: '#000000', location: 0 },
    { color: 'rgba(0,0,0,0.88)', location: 0.5 },
    { color: 'rgba(0,0,0,0.7)', location: 1 }
  ],
  progressRing: {
    base: [
      { color: colors.neutral[200], location: 0 },
      { color: colors.neutral[100], location: 1 }
    ],
    active: [
      { color: colors.accent.mint500, location: 0 },
      { color: '#36C272', location: 1 }
    ]
  }
} as const;

export type Gradients = typeof gradients;
