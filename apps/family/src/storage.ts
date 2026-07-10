import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small persistent key/value wrapper. Uses the OS secure store on native
 * (Keychain / Keystore) and falls back to localStorage on web, where
 * expo-secure-store is unavailable.
 */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
