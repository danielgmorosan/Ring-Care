/**
 * Palette. Visual language: the NestHome prototype (monochrome ink on near-white, soft
 * tinted status colours). Keep in sync with apps/family/src/theme/tokens.ts.
 */
export const colors = {
  neutral: {
    0: '#FFFFFF',
    25: '#FAFAFA',
    50: '#F5F5F5',
    75: '#F0F0F0',
    100: '#E5E7EB',
    200: '#D1D5DB',
    300: '#9CA3AF',
    500: '#6B7280',
    700: '#4B5563',
    900: '#1A1A1A',
    950: '#0A0A0A'
  },
  brand: {
    // Ink is the brand: black pill actions and active states.
    ink: '#1A1A1A',
    // Deep blue from the NestHome cover gradient, used only on the welcome hero.
    night: {
      500: '#021EF1',
      900: '#131057'
    },
    // Legacy names, remapped onto the monochrome look.
    blue: {
      300: '#6E86FF',
      400: '#3A55F5',
      500: '#1A1A1A',
      600: '#111111',
      700: '#000000'
    },
    violet: {
      300: '#C7C9D1',
      500: '#6B7280'
    },
    lilac: {
      100: '#F5F5F5',
      200: '#EBEBEB'
    }
  },
  status: {
    normal: { bg: '#E8F5E9', text: '#2E7D32', dot: '#34C759' },
    attention: { bg: '#E3F2FD', text: '#1565C0', dot: '#1565C0' },
    warning: { bg: '#FFF3E0', text: '#B34700', dot: '#F57C00' },
    alert: { bg: '#FFEBEE', text: '#C62828', dot: '#E53935' }
  },
  accent: {
    pink500: '#1A1A1A',
    mint500: '#34C759',
    lime500: '#4CAF50',
    success500: '#34C759',
    amber500: '#F57C00',
    coral500: '#E53935'
  },
  alpha: {
    white90: 'rgba(255,255,255,0.9)',
    white75: 'rgba(255,255,255,0.75)',
    white55: 'rgba(255,255,255,0.55)',
    white20: 'rgba(255,255,255,0.14)',
    black80: 'rgba(0,0,0,0.8)',
    black60: 'rgba(0,0,0,0.55)',
    black35: 'rgba(0,0,0,0.35)',
    black15: 'rgba(0,0,0,0.15)'
  }
} as const;

export type Colors = typeof colors;
