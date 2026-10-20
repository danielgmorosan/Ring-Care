import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { color, font, radius, shadow } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export type TabKey = 'home' | 'alerts' | 'care' | 'contacts' | 'timeline';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'alerts', label: 'Alerts', icon: 'bell' },
  { key: 'care', label: 'Care', icon: 'heart-pulse' },
  { key: 'contacts', label: 'People', icon: 'users' },
  { key: 'timeline', label: 'Timeline', icon: 'activity' },
];

/** NestHome's bottom navigation: line icons over labels, the active tab sitting on a soft
 * grey pill that glides between tabs. */
export function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  const [layouts, setLayouts] = useState<Partial<Record<TabKey, LayoutRectangle>>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const target = layouts[active];
  useEffect(() => {
    if (!target) return;
    if (!placed.current) {
      x.setValue(target.x);
      w.setValue(target.width);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, {
        toValue: target.x,
        stiffness: 400,
        damping: 30,
        mass: 1,
        useNativeDriver: false,
      }),
      Animated.spring(w, {
        toValue: target.width,
        stiffness: 400,
        damping: 30,
        mass: 1,
        useNativeDriver: false,
      }),
    ]).start();
  }, [target, x, w]);

  return (
    <View style={s.bar}>
      <View style={s.row}>
        {target ? (
          <Animated.View
            pointerEvents="none"
            style={[s.pill, { left: x, width: w, top: target.y, height: target.height }]}
          />
        ) : null}
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Pressable
              key={t.key}
              style={s.item}
              onPress={() => onChange(t.key)}
              onLayout={(e) => {
                const l = e.nativeEvent.layout;
                setLayouts((prev) => ({ ...prev, [t.key]: l }));
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t.label}
            >
              <Icon
                name={t.icon}
                size={22}
                color={isActive ? color.textPrimary : color.textTertiary}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <Text style={[s.label, isActive && s.labelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: color.bgSurface,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    paddingTop: 8,
    paddingBottom: 14,
    ...shadow.raised,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 8,
  },
  pill: { position: 'absolute', backgroundColor: color.bgSunken, borderRadius: radius.md },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 64,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  label: { ...font.regular, fontSize: 12, color: color.textTertiary },
  labelActive: { ...font.semibold, color: color.textPrimary },
});
