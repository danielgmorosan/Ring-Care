/** Inter (Google Fonts, via @expo-google-fonts/inter): the closest open face to NestHome's
 * SF Pro. Native apps load one file per weight, so weights map to family names. */
export const typography = {
  family: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    native: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold'
    }
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 34
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  lineHeight: {
    tight: 1.15,
    body: 1.45,
    relaxed: 1.55
  },
  tracking: {
    // Large titles tighten (-0.9px at 34pt); section labels open up (1.4px uppercase).
    tight: -0.026,
    normal: 0,
    label: 0.12
  }
} as const;

export type Typography = typeof typography;
