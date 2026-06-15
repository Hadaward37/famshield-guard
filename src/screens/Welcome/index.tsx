import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Title, Body, PrimaryButton } from '../../components/ui';
import { theme } from '../../constants/theme';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <Text style={styles.shield}>🛡️</Text>
        </View>
        <Title>FamShield Guard</Title>
        <Body muted>
          Sua defesa financeira para os piores momentos. Em um sequestro relâmpago
          ou roubo de celular, um gesto silencioso aciona seu círculo de confiança,
          compartilha sua localização e ajuda a bloquear seus bancos — sem o
          criminoso perceber.
        </Body>
      </View>

      <View style={styles.bottom}>
        <PrimaryButton title="Começar" onPress={() => navigation.navigate('Auth')} />
        <Body muted>
          Feito para o cenário brasileiro: coação, Pix e roubo de celular.
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'space-between', paddingVertical: 48 },
  top: { gap: 16 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shield: { fontSize: 36 },
  bottom: { gap: 12 },
});
