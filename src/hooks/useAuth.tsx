import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { registerPushToken, setupNotificationHandlers } from '../services/notifications';

export interface ProfileLite {
  id: string;
  nome: string | null;
  telefone: string | null;
  onboarding_completo: boolean;
}

interface AuthState {
  session: Session | null;
  profile: ProfileLite | null;
  loading: boolean;
  /** Recarrega o profile do usuário logado (ex.: após concluir onboarding). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

async function fetchProfile(userId: string): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, nome, telefone, onboarding_completo')
    .eq('id', userId)
    .maybeSingle();
  return (data as ProfileLite) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFor = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    setProfile(await fetchProfile(s.user.id));
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadFor(data.session ?? null);
  }, [loadFor]);

  useEffect(() => {
    let mounted = true;
    setupNotificationHandlers();

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      await loadFor(data.session ?? null);
      if (mounted) setLoading(false);
      // Com sessão ativa, registra o token de push deste dispositivo (best-effort).
      if (data.session) void registerPushToken();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;
      setSession(s);
      await loadFor(s);
      if (s && event === 'SIGNED_IN') void registerPushToken();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadFor]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
