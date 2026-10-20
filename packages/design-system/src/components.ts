import { colors } from './colors';
import { gradients } from './gradients';
import { layout } from './layout';
import { motion } from './motion';
import { typography } from './typography';

const pill = layout.radius.pill;

export const components = {
  statusBar: {
    /** Provided by the OS in production — do not render in design previews */
    systemProvided: true,
    height: 44
  },

  iconButton: {
    size: 36,
    radius: pill,
    fontSize: typography.size.md,
    variants: {
      onDark: {
        background: colors.alpha.black35,
        color: colors.neutral[0]
      },
      onLight: {
        background: colors.alpha.white20,
        color: colors.neutral[0]
      }
    }
  },

  button: {
    sizes: {
      lg: { minHeight: 56, fontSize: typography.size.lg, paddingHorizontal: layout.spacing[6] },
      md: { minHeight: 48, fontSize: typography.size.md, paddingHorizontal: layout.spacing[5] },
      sm: { minHeight: 36, fontSize: typography.size.sm, paddingHorizontal: layout.spacing[4] }
    },
    // NestHome rounded-2xl actions, not full pills.
    radius: layout.radius.md,
    variants: {
      primary: {
        fill: gradients.primaryCta,
        text: colors.neutral[0],
        fontWeight: typography.weight.medium,
        shadow: layout.shadow.cta
      },
      secondary: {
        fill: colors.neutral[50],
        text: colors.neutral[700],
        fontWeight: typography.weight.medium,
        shadow: null
      },
      secondaryOnLight: {
        fill: colors.neutral[75],
        text: colors.neutral[700],
        fontWeight: typography.weight.medium,
        shadow: null
      },
      compact: {
        fill: colors.brand.blue[500],
        text: colors.neutral[0],
        fontWeight: typography.weight.semibold,
        shadow: null
      },
      ghost: {
        fill: 'transparent',
        text: colors.neutral[700],
        fontWeight: typography.weight.regular,
        shadow: null
      },
      disabled: {
        fill: colors.neutral[50],
        text: colors.neutral[300],
        fontWeight: typography.weight.medium,
        shadow: null
      }
    }
  },

  stepIndicator: {
    size: 28,
    radius: pill,
    background: colors.accent.pink500,
    color: colors.neutral[0],
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold
  },

  heroOrb: {
    size: 160,
    background: colors.neutral[0],
    aura: gradients.heroAura,
    shadow: '0 16px 40px -8px rgba(83, 104, 255, 0.25)'
  },

  chip: {
    minHeight: 36,
    paddingHorizontal: layout.spacing[4],
    gap: layout.spacing[2],
    radius: pill,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    variants: {
      active: {
        background: colors.neutral[0],
        color: colors.neutral[900]
      },
      inactive: {
        background: colors.alpha.black35,
        color: colors.alpha.white90
      }
    },
    iconSize: 8
  },

  datePill: {
    paddingVertical: layout.spacing[2],
    paddingHorizontal: layout.spacing[4],
    radius: pill,
    background: colors.alpha.black35,
    color: colors.neutral[0],
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium
  },

  lightingPill: {
    radius: pill,
    background: colors.alpha.black35,
    statusBackground: colors.accent.lime500,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[0]
  },

  bottomSheet: {
    topRadius: layout.radius.xl,
    padding: layout.spacing[6],
    paddingBottom: layout.spacing[8],
    background: colors.neutral[0],
    handle: {
      width: 44,
      height: 5,
      radius: pill,
      color: colors.neutral[200],
      marginBottom: layout.spacing[5]
    }
  },

  // NestHome card: white, 20 radius, hairline border, a whisper of shadow.
  card: {
    variants: {
      elevated: {
        radius: layout.radius.lg,
        background: colors.neutral[0],
        borderColor: colors.neutral[75],
        padding: layout.spacing[5],
        shadow: layout.shadow.softCard
      },
      dark: {
        radius: layout.radius.xl,
        background: colors.neutral[900],
        padding: layout.spacing[5],
        shadow: layout.shadow.raised
      },
      inset: {
        radius: layout.radius.lg,
        background: colors.neutral[50],
        padding: layout.spacing[4],
        shadow: null
      },
      frosted: {
        radius: layout.radius.lg,
        background: colors.alpha.white75,
        padding: layout.spacing[4],
        blur: layout.blur.frosted
      }
    }
  },

  analysisItem: {
    gap: layout.spacing[4],
    thumbnail: {
      size: 56,
      radius: layout.radius.sm
    },
    areaLabel: {
      color: colors.brand.violet[500],
      fontSize: typography.size.xs,
      fontWeight: typography.weight.medium
    },
    title: {
      color: colors.neutral[900],
      fontSize: typography.size.md,
      fontWeight: typography.weight.semibold
    },
    description: {
      radius: layout.radius.md,
      background: colors.neutral[50],
      padding: layout.spacing[3],
      color: colors.neutral[700],
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.body
    }
  },

  strengthCard: {
    width: 200,
    radius: layout.radius.lg,
    background: colors.neutral[50],
    padding: layout.spacing[4]
  },

  profileMetric: {
    iconSize: 48,
    iconBorder: colors.neutral[200],
    label: {
      fontSize: 11,
      fontWeight: typography.weight.semibold,
      color: colors.neutral[900]
    },
    caption: {
      fontSize: 10,
      color: colors.neutral[500]
    }
  },

  successBadge: {
    radius: pill,
    background: 'rgba(136, 192, 87, 0.15)',
    color: colors.accent.success500,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    paddingVertical: layout.spacing[2],
    paddingHorizontal: layout.spacing[3]
  },

  recommendation: {
    numberSize: 28,
    numberBackground: colors.neutral[100],
    numberColor: colors.neutral[500],
    stepLabel: {
      fontSize: typography.size.sm,
      color: colors.neutral[500],
      fontWeight: typography.weight.medium
    },
    body: {
      fontSize: typography.size.md,
      color: colors.neutral[900],
      lineHeight: typography.lineHeight.body
    }
  },

  assistantBubble: {
    radius: layout.radius.lg,
    background: colors.neutral[50],
    padding: layout.spacing[4],
    gap: layout.spacing[3],
    avatarSize: 36,
    label: {
      fontSize: 11,
      color: colors.neutral[500]
    },
    body: {
      fontSize: typography.size.sm,
      color: colors.neutral[700],
      lineHeight: typography.lineHeight.body
    }
  },

  progressStep: {
    gap: layout.spacing[3],
    label: {
      fontSize: typography.size.md,
      color: colors.neutral[0],
      fontWeight: typography.weight.regular
    },
    checkmark: {
      size: 22,
      borderColor: colors.neutral[0],
      color: colors.neutral[0]
    },
    bar: {
      height: 8,
      radius: pill,
      track: '#2C2C2E',
      fill: colors.neutral[0]
    }
  },

  scanRing: {
    width: 200,
    height: 260,
    tickColor: colors.neutral[200],
    activeTick: colors.accent.mint500,
    instruction: {
      radius: pill,
      background: colors.alpha.black35,
      color: colors.neutral[0],
      fontSize: typography.size.sm,
      padding: layout.spacing[4]
    }
  },

  startCapture: {
    buttonSize: 140,
    rippleColor: 'rgba(255, 255, 255, 0.15)',
    buttonBackground: colors.neutral[0],
    buttonColor: colors.neutral[900],
    fontSize: typography.size.lg,
    fontWeight: typography.weight.medium
  },

  input: {
    minHeight: 52,
    fontSize: typography.size.lg,
    placeholderColor: colors.neutral[300],
    textColor: colors.neutral[900],
    borderColor: colors.neutral[100],
    caretColor: colors.brand.blue[500]
  },

  keypad: {
    background: colors.neutral[75],
    gap: layout.spacing[2],
    key: {
      radius: layout.radius.sm,
      background: colors.neutral[0],
      fontSize: 22,
      color: colors.neutral[900],
      padding: 14
    }
  },

  notificationMockup: {
    width: 180,
    height: 360,
    radius: 28,
    wallpaper: 'linear-gradient(160deg, #a8d4f0 0%, #f0c4d8 50%, #ffffff 100%)',
    card: {
      radius: layout.radius.md,
      background: colors.alpha.white75,
      blur: layout.blur.subtle,
      fontSize: 11
    }
  },

  screen: {
    welcome: {
      paddingHorizontal: layout.spacing[6],
      paddingBottom: 28,
      mainPaddingTop: 48
    },
    camera: {
      viewportBackground: colors.neutral[950],
      sheetTopRadius: 32
    },
    footer: {
      paddingBottom: 28
    },
    today: {
      heroGradientAfternoon: 'linear-gradient(180deg, #fff6d6 0%, #e8f0ff 55%, #f8f8fa 100%)',
      heroGradientEvening: 'linear-gradient(180deg, #ede8ff 0%, #f5e8ff 45%, #f8f8fa 100%)',
      dayDotSize: 38,
      bottomNavHeight: 64,
      fabSize: 56,
      fabOffsetBottom: 76
    },
    feedback: {
      sheetRadius: layout.radius.xl,
      optionRadius: pill,
      textareaMinHeight: 180
    },
    videoRoutine: {
      overlayGradient: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)',
      stepPillRadius: layout.radius.lg,
      playButtonSize: 56
    },
    skinDiary: {
      polaroidMaxWidth: 200,
      completeButtonRadius: pill
    },
    productDetail: {
      heroImageSize: 180,
      fitBadgeColor: colors.accent.success500,
      amazonButtonColor: '#fcd34d'
    },
    story: {
      segmentCount: 5,
      progressBadgeColor: '#16a34a',
      progressBadgeBackground: 'rgba(34, 197, 94, 0.15)'
    },
    buyRoutine: {
      sheetRadius: layout.radius.xl,
      tierTabActiveFill: colors.neutral[900],
      totalCtaFill: gradients.primaryCta
    },
    formula: {
      cardRadius: layout.radius.lg,
      metricBackground: colors.neutral[50]
    },
    productDetailSheet: {
      backdropColor: colors.neutral[25],
      sheetRadius: layout.radius.xl,
      peekOffset: 12
    }
  },

  bottomNav: {
    height: 64,
    iconSize: 22,
    labelSize: 10,
    activeColor: colors.neutral[900],
    inactiveColor: colors.neutral[500],
    activeIconColor: colors.accent.pink500
  },

  fab: {
    size: 56,
    background: colors.neutral[0],
    iconColor: colors.brand.violet[500],
    shadow: '0 8px 28px -6px rgba(83, 104, 255, 0.35)'
  },

  // Small line icon + uppercase tracked label + optional "View all >" link.
  sectionHeader: {
    iconSize: 16,
    fontSize: typography.size.xs,
    tracking: 1.4,
    color: '#6F7682'
  },

  // Line icons over labels; the active tab sits on a soft grey pill that springs between tabs.
  tabBar: {
    iconSize: 22,
    labelSize: typography.size.xs,
    itemMinHeight: 56,
    activeFill: colors.neutral[50],
    activeColor: colors.neutral[900],
    idleColor: '#6F7682',
    spring: { stiffness: 400, damping: 30 }
  },

  // The incident step trail: 44pt tinted icon circles on a 2px rail, title, clock time.
  escalationLadder: {
    circle: 44,
    railWidth: 2,
    railColor: colors.neutral[100],
    titleSize: 17,
    liveCard: { background: colors.neutral[900], radius: layout.radius.xl, titleSize: 26 }
  },

  motion: {
    sheetEnter: motion.durationMs.normal,
    progressFill: motion.durationMs.slow,
    ripplePulse: motion.loading.pulseMs
  }
} as const;

export type ComponentTokens = typeof components;
