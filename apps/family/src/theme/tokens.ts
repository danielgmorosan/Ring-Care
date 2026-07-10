/**
 * Obrigada design tokens for React Native, ported from the design system
 * (design/design-system.html · the ds-* vocabulary). Light mode. Keep in sync
 * with tokens.css in packages/design-system.
 */

export const color = {
  blue300: '#7da3ff',
  blue400: '#6485ff',
  blue500: '#5368ff',
  blue600: '#4755f2',
  blue700: '#3c43d8',
  violet300: '#bba8ff',
  violet500: '#8d6bff',
  lilac100: '#f4efff',
  lilac200: '#e6daff',
  pink500: '#ff8ebc',
  mint500: '#4ddc84',
  lime500: '#a3c561',
  success: '#88c057',

  neutral0: '#ffffff',
  neutral25: '#f8f8fa',
  neutral50: '#f3f3f6',
  neutral75: '#ececf1',
  neutral100: '#e4e4ea',
  neutral200: '#d0d0d9',
  neutral300: '#b4b4c0',
  neutral500: '#8f8f99',
  neutral700: '#5d5d67',
  neutral900: '#1d1d23',
  neutral950: '#0b0b10',

  // Alpha ink for dark / camera surfaces (v0.5).
  white90: 'rgba(255,255,255,0.9)',
  white75: 'rgba(255,255,255,0.75)',
  white55: 'rgba(255,255,255,0.55)',
  white20: 'rgba(255,255,255,0.2)',
  black60: 'rgba(0,0,0,0.6)',
  black35: 'rgba(0,0,0,0.35)',
  black15: 'rgba(0,0,0,0.15)',

  // Safety states (PROPOSED extensions — see design system tokens table)
  attention500: '#e8a33c',
  attention700: '#a8721a',
  attention100: '#fdf1dc',
  incident500: '#f0564d',
  incident700: '#c03a32',
  incident100: '#fde5e3',
  success100: '#ebf4e0',
  success700: '#5f8f38',

  // Semantic
  bgCanvas: '#f8f8fa',
  bgSurface: '#ffffff',
  bgSunken: '#f3f3f6',
  textPrimary: '#1d1d23',
  textSecondary: '#5d5d67',
  textTertiary: '#8f8f99',
  textInverse: '#ffffff',
  border: '#e4e4ea',
  borderStrong: '#d0d0d9',
  action: '#5368ff',
} as const;

export const gradient = {
  // [start, ...stops] as color arrays for expo-linear-gradient
  cta: ['#7da3ff', '#5368ff', '#3c43d8'] as const,
  morning: ['#fff6d6', '#e8f0ff', '#f8f8fa'] as const,
  evening: ['#ede8ff', '#f5e8ff', '#f8f8fa'] as const,
  verify: ['#e6daff', '#d4e4ff'] as const,
  camera: ['#3a3028', '#2a221c'] as const,
} as const;

/** The guardian's four border-glow states (idle uses none). Per the Figma motion spec. */
export const glow = {
  listening: '#7da3ff',
  thinking: '#8d6bff',
  speaking: '#ffb37f',
} as const;

/** Motion tokens (v0.5). Durations in ms; ease-out as a cubic-bezier control array. */
export const motion = {
  durationFast: 180,
  durationNormal: 260,
  easeOut: [0.16, 1, 0.3, 1] as const,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 48,
  12: 72,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  phone: 40,
  pill: 999,
} as const;

export const text = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export const shadow = {
  card: {
    shadowColor: '#1d1d23',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  cta: {
    shadowColor: '#5368ff',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // The assistant orb's soft blue lift (v0.5).
  orb: {
    shadowColor: '#5368ff',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  // The device-frame drop used on dark stages (v0.5).
  phone: {
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
} as const;
