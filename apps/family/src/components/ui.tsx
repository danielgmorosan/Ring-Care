import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { color, gradient, radius, shadow, space, text } from '../theme/tokens';

/** Full-bleed canvas with a scrolling content column. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[s.body, muted && s.bodyMuted]}>{children}</Text>;
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
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isGradient = variant === 'primary';
  const inner = loading ? (
    <ActivityIndicator
      color={variant === 'secondary' || variant === 'ghost' ? color.textSecondary : '#fff'}
    />
  ) : (
    <Text style={[s.btnLabel, (variant === 'secondary' || variant === 'ghost') && s.btnLabelDark]}>
      {label}
    </Text>
  );

  if (isGradient) {
    return (
      <Pressable
        onPress={disabled || loading ? undefined : onPress}
        style={[s.btnShadowCta, disabled && s.btnDisabled]}
      >
        <LinearGradient
          colors={gradient.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.btn}
        >
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={[
        s.btn,
        variant === 'secondary' && s.btnSecondary,
        variant === 'incident' && s.btnIncident,
        disabled && s.btnDisabled,
      ]}
    >
      {inner}
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
      <TextInput style={s.input} placeholderTextColor={color.textTertiary} {...inputProps} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

type Tone = 'neutral' | 'well' | 'attention' | 'incident' | 'accent';
const toneBg: Record<Tone, string> = {
  neutral: color.bgSunken,
  well: color.success100,
  attention: color.attention100,
  incident: color.incident100,
  accent: 'rgba(255,142,188,0.18)',
};
const toneFg: Record<Tone, string> = {
  neutral: color.textSecondary,
  well: color.success700,
  attention: color.attention700,
  incident: color.incident700,
  accent: '#c94a83',
};
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <View style={[s.chip, { backgroundColor: toneBg[tone] }]}>
      <Text style={[s.chipText, { color: toneFg[tone] }]}>{children}</Text>
    </View>
  );
}

export function Dot({ tone = 'well' }: { tone?: 'well' | 'attention' | 'incident' }) {
  const c =
    tone === 'well' ? color.success : tone === 'attention' ? color.attention500 : color.incident500;
  const halo =
    tone === 'well'
      ? color.success100
      : tone === 'attention'
        ? color.attention100
        : color.incident100;
  return <View style={[s.dot, { backgroundColor: c, shadowColor: c }, { borderColor: halo }]} />;
}

/** A soft tinted circle holding a single glyph: the app's lightweight icon. Matches the
 * incident ladder's status circles. */
export function IconBadge({
  glyph,
  tone = 'neutral',
  size = 36,
}: {
  glyph: string;
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
      <Text style={[s.iconGlyph, { color: toneFg[tone], fontSize: Math.round(size * 0.46) }]}>
        {glyph}
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
      {checked ? <Text style={s.checkMark}>✓</Text> : null}
    </Pressable>
  );
}

/** A segmented picker: one choice out of a few, as soft pills. */
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

/** The "‹ Back" link at the top of a sub-screen. */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ alignSelf: 'flex-start' }}>
      <Text style={s.back}>‹ {label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgCanvas },
  screenContent: { paddingBottom: space[12] },
  card: {
    backgroundColor: color.bgSurface,
    borderColor: color.neutral75,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[5],
    ...shadow.card,
  },
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: color.textPrimary },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: color.textPrimary },
  body: { fontSize: text.md, lineHeight: 24, color: color.textPrimary },
  bodyMuted: { color: color.textSecondary },
  caption: { fontSize: text.xs, color: color.textTertiary },
  btnShadowCta: { borderRadius: radius.pill, ...shadow.cta },
  btn: {
    minHeight: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
  },
  btnSecondary: { backgroundColor: color.bgSunken },
  btnIncident: {
    backgroundColor: color.incident500,
    ...shadow.card,
    shadowColor: color.incident500,
  },
  btnDisabled: { opacity: 0.45 },
  btnLabel: { fontSize: text.lg, fontWeight: '500', color: '#fff' },
  btnLabelDark: { color: color.textPrimary },
  field: { gap: space[2] },
  fieldLabel: { fontSize: text.md, fontWeight: '600', color: color.textPrimary },
  input: {
    fontSize: text.md,
    paddingVertical: 15,
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.bgSurface,
    color: color.textPrimary,
  },
  hint: { fontSize: text.xs, color: color.textTertiary },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: text.xs, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 4 },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontWeight: '700', textAlign: 'center' },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: color.action, borderColor: color.action },
  checkMark: { color: color.textInverse, fontSize: 15, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: color.bgSunken,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  segmentActive: { backgroundColor: color.bgSurface, ...shadow.card, shadowOpacity: 0.06 },
  segmentLabel: { fontSize: text.sm, fontWeight: '500', color: color.textSecondary },
  segmentLabelActive: { color: color.textPrimary, fontWeight: '600' },
  back: { color: color.action, fontSize: text.md, fontWeight: '600' },
});
