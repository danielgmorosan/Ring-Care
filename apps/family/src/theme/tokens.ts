import { Platform } from 'react-native';

/**
 * Obrigada design tokens for React Native. Light mode.
 *
 * Visual language: the NestHome prototype (clean, monochrome, Apple-like). Ink on a near-white
 * canvas, white cards with a whisper of shadow, soft tinted status colours, black pill
 * actions, Lucide line icons and Inter type. Keep in sync with packages/design-system.
 *
 * Key names are stable across the redesign so screens keep compiling; values changed.
 */

export const color = {
  // Ink scale (NestHome text/background ramp).
  ink: '#1A1A1A',
  ink80: '#2B2B2B',
  ink90: '#111111',

  // Legacy brand names, remapped onto the monochrome look.
  blue300: '#6E86FF',
  blue400: '#3A55F5',
  blue500: '#1A1A1A',
  blue600: '#111111',
  blue700: '#000000',
  violet300: '#C7C9D1',
  violet500: '#6B7280',
  lilac100: '#F5F5F5',
  lilac200: '#EBEBEB',
  pink500: '#1A1A1A',
  mint500: '#34C759',
  lime500: '#4CAF50',
  success: '#34C759',

  // Deep blue from NestHome's cover gradient (welcome hero only).
  night500: '#021EF1',
  night900: '#131057',

  neutral0: '#FFFFFF',
  neutral25: '#FAFAFA',
  neutral50: '#F5F5F5',
  neutral75: '#F0F0F0',
  neutral100: '#E5E7EB',
  neutral200: '#D1D5DB',
  neutral300: '#9CA3AF',
  neutral500: '#6B7280',
  neutral700: '#4B5563',
  neutral900: '#1A1A1A',
  neutral950: '#0A0A0A',

  // Alpha ink for dark / camera surfaces.
  white90: 'rgba(255,255,255,0.9)',
  white75: 'rgba(255,255,255,0.75)',
  white55: 'rgba(255,255,255,0.55)',
  white20: 'rgba(255,255,255,0.14)',
  white10: 'rgba(255,255,255,0.08)',
  black60: 'rgba(0,0,0,0.55)',
  black35: 'rgba(0,0,0,0.35)',
  black15: 'rgba(0,0,0,0.15)',

  // Status pairs (NestHome status.* palette; fg darkened where needed for AA on the tint).
  info100: '#E3F2FD',
  info700: '#1565C0',
  attention500: '#F57C00',
  attention700: '#B34700',
  attention100: '#FFF3E0',
  incident500: '#E53935',
  incident700: '#C62828',
  incident100: '#FFEBEE',
  success100: '#E8F5E9',
  success700: '#2E7D32',

  // Semantic
  bgCanvas: '#FAFAFA',
  bgSurface: '#FFFFFF',
  bgSunken: '#F5F5F5',
  bgDark: '#1A1A1A',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  // NestHome uses #9CA3AF for meta text; nudged darker so small text keeps 4.5:1 on white.
  textTertiary: '#6F7682',
  textInverse: '#FFFFFF',
  border: '#F0F0F0',
  borderStrong: '#E5E7EB',
  action: '#1A1A1A',
} as const;

export const gradient = {
  // [start, ...stops] as color arrays for expo-linear-gradient
  cta: ['#2B2B2B', '#1A1A1A'] as const,
  morning: ['#FFFFFF', '#FAFAFA'] as const,
  evening: ['#F5F5F5', '#FAFAFA'] as const,
  verify: ['#F5F5F5', '#EBEBEB'] as const,
  camera: ['#1F1F1F', '#0A0A0A'] as const,
  // The NestHome cover fade: deep blue rising from the bottom of a photo.
  cover: ['rgba(19,16,87,0)', 'rgba(19,16,87,0.55)', 'rgba(2,30,241,0.85)'] as const,
  // A soft status wash behind the home hero.
  well: ['#EEF8EF', '#FFFFFF'] as const,
  alert: ['#FFEFEF', '#FFFFFF'] as const,
} as const;

/** The guardian's four border-glow states (idle uses none). Per the Figma motion spec. */
export const glow = {
  listening: '#7da3ff',
  thinking: '#8d6bff',
  speaking: '#ffb37f',
} as const;

/** Motion tokens. Durations in ms; NestHome's iOS-style deceleration curve. */
export const motion = {
  durationFast: 180,
  durationNormal: 260,
  durationSlide: 450,
  easeOut: [0.32, 0.72, 0, 1] as const,
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
  lg: 20,
  xl: 28,
  phone: 40,
  pill: 999,
} as const;

export const text = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 34,
} as const;

/**
 * Inter, one face per weight (the closest Google font to NestHome's SF Pro). Use these
 * instead of fontWeight so Android and web pick the right file.
 */
// On web the face name is a CSS family list, so a font that fails to load falls back to the
// system sans (SF Pro on Apple devices, which is what NestHome itself uses).
const WEB_FALLBACK = ', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const face = (name: string) => ({
  fontFamily: Platform.OS === 'web' ? `${name}${WEB_FALLBACK}` : name,
});

export const font = {
  regular: face('Inter_400Regular'),
  medium: face('Inter_500Medium'),
  semibold: face('Inter_600SemiBold'),
  bold: face('Inter_700Bold'),
} as const;

export const shadow = {
  // NestHome shadow-card: 0 2px 12px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.06).
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // shadow-card-hover / raised surfaces.
  raised: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cta: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  orb: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  phone: {
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
} as const;
