import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from './api/client';
import { registerForPush, unregisterForPush } from './push';
import { authResultSchema, sessionSchema, type AuthResult, type Session } from './api/types';
import { deleteItem, getItem, setItem } from './storage';

const TOKEN_KEY = 'obrigada.token';
// First-run setup is tracked per family so a caregiver who finishes it once is not
// walked through it again. Device-local for now; a server-side flag that follows the
// caregiver across phones is a noted follow-up.
const onboardedKey = (familyId: string) => `obrigada.onboarded.${familyId}`;

type Status = 'loading' | 'signed-out' | 'signed-in';

interface AuthState {
  status: Status;
  session: Session | null;
  /** True once the family has been through (or skipped) first-run setup. */
  onboarded: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, familyName: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Mark first-run setup done for the signed-in family, and leave onboarding. */
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  async function clear(): Promise<void> {
    // Unregister this device before dropping the token (the call needs auth).
    await unregisterForPush();
    await deleteItem(TOKEN_KEY);
    setAuthToken(null);
    setSession(null);
    setOnboarded(false);
    setStatus('signed-out');
  }

  async function persist(result: AuthResult): Promise<void> {
    await setItem(TOKEN_KEY, result.token);
    setAuthToken(result.token);
    setSession({ user: result.user, family: result.family });
    // Resolve first-run setup before flipping to signed-in so onboarding does not flash.
    setOnboarded((await getItem(onboardedKey(result.family.id))) === '1');
    setStatus('signed-in');
    // Ask for notification permission and register this device (native only).
    void registerForPush();
  }

  useEffect(() => {
    // A rejected authenticated request (expired/invalid token) logs us out.
    setUnauthorizedHandler(() => {
      void clear();
    });

    void (async () => {
      const token = await getItem(TOKEN_KEY);
      if (!token) {
        setStatus('signed-out');
        return;
      }
      setAuthToken(token);
      try {
        const me = await api('/auth/me', { schema: sessionSchema });
        setSession(me);
        setOnboarded((await getItem(onboardedKey(me.family.id))) === '1');
        setStatus('signed-in');
        // Re-affirm this device's registration on every launch.
        void registerForPush();
      } catch {
        await clear();
      }
    })();

    return () => setUnauthorizedHandler(null);
  }, []);

  const value: AuthState = {
    status,
    session,
    onboarded,
    completeOnboarding: async () => {
      if (session) await setItem(onboardedKey(session.family.id), '1');
      setOnboarded(true);
    },
    login: async (email, password) => {
      const result = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
        schema: authResultSchema,
      });
      await persist(result);
    },
    signup: async (email, password, familyName) => {
      // Send the caregiver's device timezone so "today" is the elder's local day.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await api('/auth/signup', {
        method: 'POST',
        body: { email, password, familyName, timezone },
        schema: authResultSchema,
      });
      await persist(result);
    },
    logout: clear,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
