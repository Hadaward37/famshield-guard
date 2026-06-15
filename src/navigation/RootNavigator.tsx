import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import WelcomeScreen from '../screens/Welcome';
import AuthScreen from '../screens/Auth';
import ConsentScreen from '../screens/Consent';
import CircleScreen from '../screens/Circle';
import HomeScreen from '../screens/Home';
import PanicScreen from '../screens/Panic';
import RecoveryScreen from '../screens/Recovery';

export type RootStackParamList = {
  Welcome: undefined;
  Auth: undefined;
  Consent: undefined;
  Circle: undefined;
  Home: undefined;
  Panic: undefined;
  Recovery: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.splashShield}>🛡️</Text>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();

  // Enquanto resolve a sessão/profile, mostra splash — evita flicker de tela errada.
  if (loading) return <Splash />;

  const onboardingCompleto = profile?.onboarding_completo === true;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {!session ? (
        // Sem sessão -> fluxo de boas-vindas + autenticação.
        <Stack.Group screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: true, title: '' }} />
        </Stack.Group>
      ) : !onboardingCompleto ? (
        // Com sessão, onboarding pendente -> consentimento + círculo.
        <Stack.Group>
          <Stack.Screen name="Consent" component={ConsentScreen} options={{ title: 'Privacidade' }} />
          <Stack.Screen name="Circle" component={CircleScreen} options={{ title: 'Círculo' }} />
        </Stack.Group>
      ) : (
        // Onboarding concluído -> app.
        <Stack.Group>
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Panic" component={PanicScreen} />
          <Stack.Screen name="Recovery" component={RecoveryScreen} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  splashShield: { fontSize: 48 },
});
