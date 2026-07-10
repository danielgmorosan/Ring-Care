export const typography = {
  family: {
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif'
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 46
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600
  },
  lineHeight: {
    tight: 1.15,
    body: 1.35,
    relaxed: 1.45
  },
  tracking: {
    tight: -0.02,
    normal: 0,
    wide: 0.02
  }
} as const;

export type Typography = typeof typography;
