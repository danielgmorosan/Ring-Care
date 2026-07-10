export const colors = {
  neutral: {
    0: '#FFFFFF',
    25: '#F8F8FA',
    50: '#F3F3F6',
    75: '#ECECF1',
    100: '#E4E4EA',
    200: '#D0D0D9',
    300: '#B4B4C0',
    500: '#8F8F99',
    700: '#5D5D67',
    900: '#1D1D23',
    950: '#0B0B10'
  },
  brand: {
    blue: {
      300: '#7DA3FF',
      400: '#6485FF',
      500: '#5368FF',
      600: '#4755F2',
      700: '#3C43D8'
    },
    violet: {
      300: '#BBA8FF',
      500: '#8D6BFF'
    },
    lilac: {
      100: '#F4EFFF',
      200: '#E6DAFF'
    }
  },
  accent: {
    pink500: '#FF8EBC',
    mint500: '#4DDC84',
    lime500: '#A3C561',
    success500: '#88C057',
    amber500: '#F5C04D',
    coral500: '#FF7A74'
  },
  alpha: {
    white90: 'rgba(255,255,255,0.9)',
    white75: 'rgba(255,255,255,0.75)',
    white55: 'rgba(255,255,255,0.55)',
    white20: 'rgba(255,255,255,0.2)',
    black80: 'rgba(0,0,0,0.8)',
    black60: 'rgba(0,0,0,0.6)',
    black35: 'rgba(0,0,0,0.35)',
    black15: 'rgba(0,0,0,0.15)'
  }
} as const;

export type Colors = typeof colors;
