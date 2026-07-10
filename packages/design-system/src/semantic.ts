import { colors } from './colors';
import { gradients } from './gradients';

export const semantic = {
  text: {
    primary: colors.neutral[900],
    secondary: colors.neutral[500],
    tertiary: colors.neutral[300],
    inverse: colors.neutral[0],
    onDark: colors.alpha.white90
  },
  surface: {
    page: colors.neutral[0],
    section: colors.neutral[25],
    card: colors.neutral[0],
    frosted: colors.alpha.white75,
    overlayDark: colors.alpha.black60
  },
  border: {
    subtle: colors.neutral[75],
    default: colors.neutral[100],
    strong: colors.neutral[200]
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
    success: colors.accent.mint500,
    warning: colors.accent.amber500,
    danger: colors.accent.coral500
  }
} as const;

export type SemanticTokens = typeof semantic;
