import { StyleSheet, Text, View } from 'react-native';
import type { LiveGrant } from '../api/types';
import { color, space, text } from '../theme/tokens';

/**
 * Web / default placeholder. Live video needs native WebRTC, so it runs on the mobile app;
 * the real implementation is LiveView.native.tsx (Metro picks it on device). tsc and the web
 * bundle resolve this file, so no native LiveKit code ever enters the web build.
 */
export function LiveView(_props: { grant: LiveGrant }) {
  return (
    <View style={s.box}>
      <Text style={s.title}>Live view runs on the app</Text>
      <Text style={s.body}>Open Obrigada on your phone to watch the guardian&apos;s camera.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[6],
  },
  title: { color: color.textInverse, fontSize: text.lg, fontWeight: '600' },
  body: { color: color.white75, fontSize: text.md, textAlign: 'center' },
});
