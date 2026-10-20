import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
// The NestHome cover photo, re-encoded small for the bundle.
import COVER from '../../assets/welcome-cover.jpg';
import { useAuth } from '../auth-state';
import { Button, Caption, FadeIn, Field, Icon } from '../components/ui';
import { color, font, gradient, radius, shadow, space, text } from '../theme/tokens';

/** Sign in or create an account. Signup also names the family. */
export function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= (isSignup ? 8 : 1) &&
    (!isSignup || familyName.trim().length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        await signup(email.trim(), password, familyName.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const cover = (
    <View style={[st.cover, wide ? st.coverWide : st.coverTall]}>
      <Image source={COVER} style={st.coverImage} resizeMode="cover" />
      <LinearGradient
        colors={gradient.cover}
        locations={[0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={st.brand}>
        <View style={st.brandMark}>
          <Icon name="heart-pulse" size={16} color={color.textPrimary} />
        </View>
        <Text style={st.brandText}>obrigada</Text>
      </View>
      <View style={[st.coverText, wide && st.coverTextWide]}>
        <Text style={st.coverTitle}>
          {isSignup ? 'Watch over someone you love' : 'Welcome back'}
        </Text>
        <Text style={st.coverSub}>
          {isSignup
            ? 'Create your account and name your family. You will get the alerts and manage the home.'
            : 'Sign in to your family.'}
        </Text>
      </View>
    </View>
  );

  const form = (
    <FadeIn style={[st.sheet, wide && st.sheetWide]}>
      <View style={{ gap: space[5] }}>
        <Field
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Password"
          placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        {isSignup ? (
          <Field
            label="Family name"
            placeholder="Silva family"
            value={familyName}
            onChangeText={setFamilyName}
            autoCapitalize="words"
          />
        ) : null}

        <Button
          label={isSignup ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
        />
        {error ? <Caption>{error}</Caption> : null}
      </View>

      <Pressable
        onPress={() => {
          setMode(isSignup ? 'login' : 'signup');
          setError(null);
        }}
        style={st.switch}
        accessibilityRole="button"
      >
        <Text style={st.switchText}>
          {isSignup ? 'I already have an account' : 'Create a new account'}
        </Text>
      </Pressable>

      <View style={st.privacy}>
        <Icon name="shield-check" size={16} color={color.textTertiary} />
        <Text style={st.privacyText}>
          Obrigada never records video. The guardian looks, then forgets.
        </Text>
      </View>
    </FadeIn>
  );

  if (wide) {
    return (
      <View style={st.wide}>
        {cover}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={st.wideRight}>
          {form}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ paddingBottom: space[8] }}>
      {cover}
      {form}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgCanvas },
  wide: { flex: 1, flexDirection: 'row', backgroundColor: color.bgCanvas },
  wideRight: { flexGrow: 1, justifyContent: 'center', padding: space[10] },
  cover: { overflow: 'hidden', backgroundColor: color.night900, justifyContent: 'space-between' },
  coverTall: { height: 480 },
  // Explicit size: on web the asset's own 900x1000 would otherwise win over absoluteFill.
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  coverWide: { flex: 1, margin: space[4], borderRadius: radius.xl },
  brand: {
    position: 'relative',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    alignSelf: 'flex-start',
    margin: space[5],
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.bgSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { ...font.bold, fontSize: 15, letterSpacing: -0.2, color: color.textPrimary },
  coverText: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: space[6],
    paddingBottom: space[10],
    gap: space[2],
  },
  coverTextWide: { paddingHorizontal: space[10], paddingBottom: space[12] },
  coverTitle: {
    ...font.semibold,
    color: color.textInverse,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  coverSub: {
    ...font.regular,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  sheet: {
    marginTop: -28,
    marginHorizontal: 0,
    backgroundColor: color.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space[6],
    paddingTop: space[8],
    gap: space[4],
  },
  sheetWide: {
    marginTop: 0,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.raised,
  },
  switch: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  switchText: { ...font.semibold, color: color.textPrimary, fontSize: text.md },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[2],
  },
  privacyText: {
    ...font.regular,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    color: color.textTertiary,
  },
});
