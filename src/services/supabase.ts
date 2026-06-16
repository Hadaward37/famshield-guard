// react-native-url-polyfill ainda é necessário: o Hermes (RN 0.85 no SDK 56)
// só implementa URL/URLSearchParams parcialmente, e o supabase-js depende deles.
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from './secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: {
    // Sessão persistida de forma criptografada (SecureStore + AES no AsyncStorage).
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    // Em React Native não há URL de callback no navegador.
    detectSessionInUrl: false,
  },
});

// Padrão recomendado pela doc do Supabase para React Native: só renova o token
// enquanto o app está em foreground, para não desperdiçar bateria/rede.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
