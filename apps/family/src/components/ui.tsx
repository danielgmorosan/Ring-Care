import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { color, font, radius, shadow, space, text } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export { Icon, type IconName } from './Icon';

/** Full-bleed canvas with a scrolling content column (max 640 wide on large screens). */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent}>
      <FadeIn style={s.column}>{children}</FadeIn>
    </ScrollView>
  );
}

/** A gentle fade and rise when a screen mounts (NestHome's stagger, kept to one step). */
export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 380,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: false,
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Card({
  children,
  style,
  dark,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  return <View style={[s.card, dark && s.cardDark, style]}>{children}</View>;
}

/** The big page title block: an optional eyebrow, a 34pt title, a quiet subtitle, and an
 * optional control on the right (NestHome's "Activity / 2026" header). */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={s.pageHeader}>
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
        <Text style={s.pageTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={s.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A section label: small line icon, uppercase tracked text, optional link on the right. */
export function SectionHeader({
  icon,
  label,
  action,
  onAction,
  right,
}: {
  icon?: IconName;
  label: string;
  action?: string;
  onAction?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionLeft}>
        {icon ? <Icon name={icon} size={16} color={color.textTertiary} /> : null}
        <Text style={s.sectionLabel} accessibilityRole="header">
          {label.toUpperCase()}
        </Text>
      </View>
      {right}
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
          <Icon name="chevron-right" size={16} color={color.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <Text style={s.h1} accessibilityRole="header">
      {children}
    </Text>
  );
}
export function H2({ children }: { children: ReactNode }) {
  return (
    <Text style={s.h2} accessibilityRole="header">
      {children}
    </Text>
  );
}
export function Body({
  children,
  muted,
  strong,
}: {
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
}) {
  return <Text style={[s.body, muted && s.bodyMuted, strong && s.bodyStrong]}>{children}</Text>;
}
export function Caption({ children }: { children: ReactNode }) {
  return <Text style={s.caption}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'incident';
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  compact,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
}) {
  const light = variant === 'secondary' || variant === 'ghost';
  const fg = light ? color.textPrimary : color.textInverse;
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        s.btn,
        compact && s.btnCompact,
        variant === 'primary' && s.btnPrimary,
        variant === 'secondary' && s.btnSecondary,
        variant === 'incident' && s.btnIncident,
        disabled && s.btnDisabled,
        pressed && !disabled && s.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.btnInner}>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[s.btnLabel, compact && s.btnLabelCompact, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.input}
        placeholderTextColor={color.textTertiary}
        accessibilityLabel={label}
        {...inputProps}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export type Tone = 'neutral' | 'well' | 'attention' | 'incident' | 'accent' | 'info';
export const toneBg: Record<Tone, string> = {
  neutral: color.bgSunken,
  well: color.success100,
  attention: color.attention100,
  incident: color.incident100,
  accent: color.ink,
  info: color.info100,
};
export const toneFg: Record<Tone, string> = {
  neutral: color.textSecondary,
  well: color.success700,
  attention: color.attention700,
  incident: color.incident700,
  accent: color.textInverse,
  info: color.info700,
};
export const toneDot: Record<Tone, string> = {
  neutral: color.neutral300,
  well: color.success,
  attention: color.attention500,
  incident: color.incident500,
  accent: color.textInverse,
  info: color.info700,
};

export function Chip({
  children,
  tone = 'neutral',
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <View style={[s.chip, { backgroundColor: toneBg[tone] }]}>
      {dot ? <View style={[s.chipDot, { backgroundColor: toneDot[tone] }]} /> : null}
      <Text style={[s.chipText, { color: toneFg[tone] }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

export function Dot({
  tone = 'well',
  pulse,
}: {
  tone?: 'well' | 'attention' | 'incident';
  pulse?: boolean;
}) {
  const c = toneDot[tone];
  const halo = toneBg[tone];
  return (
    <View style={s.dotWrap}>
      {pulse ? <Pulse color={c} size={10} /> : null}
      <View style={[s.dot, { backgroundColor: c, borderColor: halo }]} />
    </View>
  );
}

/** A soft ring that breathes out of a dot or badge. Used for live and in-progress states. */
export function Pulse({
  color: c,
  size,
  scale = 2.6,
}: {
  color: string;
  size: number;
  scale?: number;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1800,
        easing: Easing.bezier(0.4, 0, 0.6, 1),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
      }}
    />
  );
}

/** A soft tinted circle holding one line icon. */
export function IconBadge({
  icon,
  tone = 'neutral',
  size = 40,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
}) {
  return (
    <View
      style={[
        s.iconBadge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: toneBg[tone] },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={toneFg[tone]} />
    </View>
  );
}

/** Initials in a soft grey circle (NestHome's household avatars). */
export function Avatar({ name, size = 44, dark }: { name: string; size?: number; dark?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <View
      style={[
        s.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        dark && s.avatarDark,
      ]}
    >
      <Text style={[s.avatarText, { fontSize: Math.round(size * 0.34) }, dark && s.avatarTextDark]}>
        {initials}
      </Text>
    </View>
  );
}

/** A large, calm checkbox (44pt hit area). */
export function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[s.checkbox, checked && s.checkboxOn]}
    >
      {checked ? <Icon name="check" size={16} color={color.textInverse} strokeWidth={3} /> : null}
    </Pressable>
  );
}

/** A segmented picker: NestHome's sunken track with a raised white thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => (active ? undefined : onChange(o.value))}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentLabel, active && s.segmentLabelActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The back control at the top of a sub-screen: a chevron and the parent's name. */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={s.back}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
    >
      <Icon name="chevron-left" size={20} color={color.textPrimary} />
      <Text style={s.backText}>{label}</Text>
    </Pressable>
  );
}

/** A quiet text action (Edit, Remove) with a 44pt hit area. */
export function TextAction({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={s.textAction} accessibilityRole="button">
      <Text style={[s.textActionLabel, danger && { color: color.incident700 }]}>{label}</Text>
    </Pressable>
  );
}

/** A hairline divider between rows inside a card. */
export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgCanvas },
  screenContent: { paddingBottom: space[12] },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: {
    backgroundColor: color.bgSurface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[5],
    ...shadow.card,
  },
  cardDark: { backgroundColor: color.bgDark, borderColor: color.bgDark, ...shadow.raised },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    marginTop: space[3],
  },
  eyebrow: {
    ...font.medium,
    fontSize: text.sm,
    color: color.textTertiary,
  },
  pageTitle: {
    ...font.bold,
    fontSize: text.xxl,
    lineHeight: 40,
    letterSpacing: -0.9,
    color: color.textPrimary,
  },
  pageSubtitle: { ...font.regular, fontSize: text.md, lineHeight: 22, color: color.textTertiary },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    marginTop: space[2],
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1 },
  sectionLabel: {
    ...font.semibold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: color.textTertiary,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  sectionActionText: { ...font.medium, fontSize: text.sm, color: color.textTertiary },
  h1: {
    ...font.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: color.textPrimary,
  },
  h2: {
    ...font.semibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: color.textPrimary,
  },
  body: { ...font.regular, fontSize: text.md, lineHeight: 23, color: color.textPrimary },
  bodyMuted: { color: color.textSecondary },
  bodyStrong: { ...font.semibold },
  caption: { ...font.regular, fontSize: 13, lineHeight: 18, color: color.textTertiary },
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
  },
  btnCompact: { minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  btnPrimary: { backgroundColor: color.ink, ...shadow.cta },
  btnSecondary: { backgroundColor: color.bgSunken },
  btnIncident: { backgroundColor: color.incident700, ...shadow.cta },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnLabel: { ...font.semibold, fontSize: text.md },
  btnLabelCompact: { fontSize: text.sm },
  field: { gap: space[2] },
  fieldLabel: { ...font.semibold, fontSize: text.sm, color: color.textPrimary },
  input: {
    ...font.regular,
    fontSize: text.md,
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    color: color.textPrimary,
  },
  hint: { ...font.regular, fontSize: 13, lineHeight: 18, color: color.textTertiary },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { ...font.semibold, fontSize: 12.5 },
  dotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  avatar: {
    backgroundColor: color.bgSunken,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarDark: { backgroundColor: '#2E2E2E', borderColor: '#3A3A3A' },
  avatarText: { ...font.bold, color: color.textPrimary, letterSpacing: 0.3 },
  avatarTextDark: { color: color.textInverse },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.neutral200,
    backgroundColor: color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: color.ink, borderColor: color.ink },
  segmented: {
    flexDirection: 'row',
    backgroundColor: color.bgSunken,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  segmentActive: { backgroundColor: color.bgSurface, ...shadow.card, shadowOpacity: 0.08 },
  segmentLabel: { ...font.medium, fontSize: text.sm, color: color.textSecondary },
  segmentLabelActive: { ...font.semibold, color: color.textPrimary },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingRight: space[3],
    marginLeft: -6,
  },
  backText: { ...font.semibold, color: color.textPrimary, fontSize: text.md },
  textAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  textActionLabel: { ...font.semibold, color: color.textPrimary, fontSize: text.sm },
  divider: { height: 1, backgroundColor: color.border },
});
