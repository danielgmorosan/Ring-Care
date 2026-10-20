export const layout = {
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
    pill: 999
  },
  borderWidth: {
    hairline: 1,
    thin: 1.5,
    thick: 2
  },
  blur: {
    subtle: 12,
    frosted: 24,
    aura: 42
  },
  shadow: {
    // NestHome shadow-soft / shadow-card / shadow-card-hover.
    cta: {
      color: 'rgba(0,0,0,0.12)',
      x: 0,
      y: 4,
      blur: 12,
      spread: 0
    },
    softCard: {
      color: 'rgba(0,0,0,0.05)',
      x: 0,
      y: 2,
      blur: 12,
      spread: 0
    },
    raised: {
      color: 'rgba(0,0,0,0.08)',
      x: 0,
      y: 4,
      blur: 20,
      spread: 0
    }
  }
} as const;

export type Layout = typeof layout;
