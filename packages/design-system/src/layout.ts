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
    lg: 22,
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
    cta: {
      color: 'rgba(83,104,255,0.42)',
      x: 0,
      y: 8,
      blur: 24,
      spread: -4
    },
    softCard: {
      color: 'rgba(29,29,35,0.08)',
      x: 0,
      y: 8,
      blur: 24,
      spread: -10
    }
  }
} as const;

export type Layout = typeof layout;
