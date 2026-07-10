import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, text } from '../theme/tokens';

export type TabKey = 'home' | 'alerts' | 'care' | 'contacts' | 'timeline';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'care', label: 'Care' },
  { key: 'contacts', label: 'People' },
  { key: 'timeline', label: 'Timeline' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <View style={s.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable key={t.key} style={s.item} onPress={() => onChange(t.key)}>
            <View style={[s.dot, isActive ? s.dotActive : s.dotIdle]} />
            <Text style={[s.label, isActive && s.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: color.bgSurface,
    borderTopWidth: 1,
    borderTopColor: color.neutral75,
  },
  item: { alignItems: 'center', gap: 6, minWidth: 64 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: color.pink500 },
  dotIdle: { backgroundColor: color.neutral300 },
  label: { fontSize: text.xs, fontWeight: '500', color: color.textTertiary },
  labelActive: { color: color.textPrimary, fontWeight: '600' },
});
