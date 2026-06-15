import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Title, Body, Card, GhostButton } from '../../components/ui';
import { theme } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [contatos, setContatos] = useState<number | null>(null);

  const loadCount = useCallback(async () => {
    if (!session) return;
    const { count } = await supabase
      .from('circulo_confianca')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id);
    setContatos(count ?? 0);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadCount();
    }, [loadCount]),
  );

  const primeiroNome = (profile?.nome ?? '').split(' ')[0] || 'você';

  function handlePanicPlaceholder() {
    Alert.alert(
      'Em construção',
      'O botão de pânico ainda não está funcional. A lógica de acionamento (localização, foto, alerta ao círculo) chega na próxima etapa.',
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.header}>
        <Title>Olá, {primeiroNome}</Title>
        <Body muted>
          {contatos === null
            ? 'Carregando seu círculo…'
            : `${contatos} ${contatos === 1 ? 'contato' : 'contatos'} no seu círculo de confiança.`}
        </Body>
      </View>

      <View style={styles.center}>
        <Pressable
          onPress={handlePanicPlaceholder}
          style={({ pressed }) => [styles.panicBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.panicLabel}>PÂNICO</Text>
          <Text style={styles.panicSub}>placeholder · não funcional</Text>
        </Pressable>
        <Card style={styles.warnCard}>
          <Body muted>
            ⚠️ Este botão é um placeholder. A lógica de pânico (gesto silencioso,
            localização, foto e alerta ao círculo) será implementada na próxima etapa.
          </Body>
        </Card>
      </View>

      <View style={styles.footer}>
        <GhostButton title="Sair da conta" onPress={handleLogout} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'space-between', paddingVertical: 32 },
  header: { gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  panicBtn: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#7F1D1D',
  },
  panicLabel: { color: theme.colors.text, fontSize: 32, fontWeight: '800', letterSpacing: 2 },
  panicSub: { color: '#FCA5A5', fontSize: 12, marginTop: 6 },
  warnCard: { borderColor: '#7F1D1D' },
  footer: { alignItems: 'center' },
});
