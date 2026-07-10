import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth-state';
import { Body, Button, Card, Caption, Field, H1, Screen } from '../components/ui';
import { color, space } from '../theme/tokens';

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

  return (
    <Screen>
      <View style={{ padding: space[6], gap: space[6] }}>
        <View style={{ gap: space[2], marginTop: space[6] }}>
          <Caption>OBRIGADA</Caption>
          <H1>{isSignup ? 'Watch over someone you love' : 'Welcome back'}</H1>
          <Body muted>
            {isSignup
              ? 'Create your account and name your family. You will get the alerts and manage the home.'
              : 'Sign in to your family.'}
          </Body>
        </View>

        <Card style={{ gap: space[5] }}>
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
        </Card>

        <Pressable
          onPress={() => {
            setMode(isSignup ? 'login' : 'signup');
            setError(null);
          }}
          style={{ alignItems: 'center' }}
        >
          <Text style={{ color: color.action, fontWeight: '600' }}>
            {isSignup ? 'I already have an account' : 'Create a new account'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
