import { colors } from './colors';
import { gradients } from './gradients';

export const semantic = {
  text: {
    primary: colors.neutral[900],
    secondary: colors.neutral[500],
    // NestHome uses #9CA3AF; nudged darker so small text keeps 4.5:1 on white.
    tertiary: '#6F7682',
    inverse: colors.neutral[0],
    onDark: colors.alpha.white90
  },
  surface: {
    page: colors.neutral[25],
    section: colors.neutral[50],
    card: colors.neutral[0],
    frosted: colors.alpha.white75,
    overlayDark: colors.alpha.black60
  },
  border: {
    subtle: colors.neutral[75],
    default: colors.neutral[75],
    strong: colors.neutral[100]
  },
  action: {
    primaryFill: gradients.primaryCta,
    primaryText: colors.neutral[0],
    secondaryFill: colors.neutral[50],
    secondaryText: colors.neutral[900],
    disabledFill: colors.neutral[50],
    disabledText: colors.neutral[300]
  },
  feedback: {
    success: colors.status.normal,
    warning: colors.status.warning,
    danger: colors.status.alert,
    info: colors.status.attention
  }
} as const;

export type SemanticTokens = typeof semantic;
