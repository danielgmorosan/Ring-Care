import './src/livekit-setup'; // registers native WebRTC globals for live view (no-op on web)
// Per-weight imports so only these four faces land in the bundle.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth-state';
import { TabBar, type TabKey } from './src/components/TabBar';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { CareScreen } from './src/screens/CareScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { TimelineScreen } from './src/screens/TimelineScreen';
import { color } from './src/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function Root() {
  const { status, onboarded } = useAuth();
  const [tab, setTab] = useState<TabKey>('home');
  // Inter ships in the bundle; if it ever fails to load we fall back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (status === 'loading' || (!fontsLoaded && !fontError)) {
    return (
      <View style={[s.shell, s.center]}>
        <ActivityIndicator color={color.action} />
      </View>
    );
  }

  if (status === 'signed-out') {
    return <AuthScreen />;
  }

  // Signed in but first-run setup not finished: walk the caregiver through the essentials.
  if (!onboarded) {
    return <OnboardingScreen />;
  }

  return (
    <View style={s.shell}>
      <View style={s.body}>
        {tab === 'home' ? (
          <HomeScreen />
        ) : tab === 'alerts' ? (
          <AlertsScreen />
        ) : tab === 'care' ? (
          <CareScreen />
        ) : tab === 'contacts' ? (
          <ContactsScreen />
        ) : (
          <TimelineScreen />
        )}
      </View>
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaView style={s.safe}>
          <StatusBar style="dark" />
          <Root />
        </SafeAreaView>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bgCanvas },
  shell: { flex: 1 },
  body: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
