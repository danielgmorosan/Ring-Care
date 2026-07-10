import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api/client';
import { deleteItem, getItem, setItem } from './storage';

/**
 * Critical-alert registration. After the caregiver signs in, the app asks the OS
 * for notification permission and, if granted, sends this device's push token to
 * the backend so the escalation ladder can alarm this phone during an incident.
 *
 * The true "sounds through silent mode" behavior needs a native build plus the iOS
 * Critical Alerts entitlement (see docs/decisions/0004); on the web build this is a
 * no-op. Everything here is best-effort and never blocks sign-in.
 */
const PUSH_TOKEN_KEY = 'obrigada.pushToken';

export async function registerForPush(): Promise<void> {
  try {
    // Web push is a separate (PWA) path; native only for now.
    if (Platform.OS === 'web' || !Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted ||
      (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;

    // The native FCM (Android) / APNs (iOS) token — what our FCM backend targets.
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const token = String(devicePushToken.data);
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    await api('/me/push-tokens', { method: 'POST', body: { token, platform } });
    await setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // Never let alert registration break the app; the ladder still runs server-side.
  }
}

/** Remove this device on sign-out so a former caregiver's phone stops being alerted. */
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    await api(`/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
    await deleteItem(PUSH_TOKEN_KEY);
  } catch {
    // Best-effort.
  }
}
