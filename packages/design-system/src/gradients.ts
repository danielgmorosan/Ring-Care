import { colors } from './colors';

export type GradientStop = {
  readonly color: string;
  readonly location: number;
};

export type GradientToken = readonly GradientStop[];

export const gradients = {
  primaryCta: [
    { color: colors.brand.blue[300], location: 0 },
    { color: colors.brand.blue[500], location: 0.52 },
    { color: colors.brand.blue[700], location: 1 }
  ],
  heroAura: [
    { color: colors.brand.lilac[100], location: 0 },
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
