import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Title, Body, Card, GhostButton } from '../../components/ui';
import PanicButton from '../../components/PanicButton';
import PanicFlow from '../Panic/PanicFlow';
import { theme } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';

interface UltimoEvento {
  id: string;
  criado_em: string;
  notificacoes_enviadas: number;
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

function UltimoAlertaCard({ evento }: { evento: UltimoEvento }) {
  return (
    <Card style={styles.alertaCard}>
      <Text style={styles.alertaTitulo}>Último alerta</Text>
      <Text style={styles.alertaData}>{formatarDataHora(evento.criado_em)}</Text>
      <Text style={styles.alertaInfo}>
        {evento.notificacoes_enviadas}{' '}
        {evento.notificacoes_enviadas === 1 ? 'contato notificado' : 'contatos notificados'}
      </Text>
    </Card>
  );
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const [contatos, setContatos] = useState<number | null>(null);
  const [ultimoEvento, setUltimoEvento] = useState<UltimoEvento | null>(null);
  const [panicVisible, setPanicVisible] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;

    const [{ count }, { data: evento }] = await Promise.all([
      supabase
        .from('circulo_confianca')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('eventos_panico')
        .select('id, criado_em, notificacoes_enviadas')
        .eq('user_id', userId)
        .eq('cancelado', false)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setContatos(count ?? 0);
    setUltimoEvento((evento as UltimoEvento) ?? null);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const primeiroNome = (profile?.nome ?? '').split(' ')[0] || 'você';

  // Mostra o card só se o último alerta foi nas últimas 24h.
  const alertaRecente =
    ultimoEvento &&
    Date.now() - new Date(ultimoEvento.criado_em).getTime() < 24 * 60 * 60 * 1000;

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
        <PanicButton onPanicTriggered={() => setPanicVisible(true)} />
        {alertaRecente && ultimoEvento ? <UltimoAlertaCard evento={ultimoEvento} /> : null}
      </View>

      <View style={styles.footer}>
        <GhostButton title="Sair da conta" onPress={handleLogout} />
      </View>

      <PanicFlow visible={panicVisible} onDismiss={() => setPanicVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'space-between', paddingVertical: 32 },
  header: { gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  footer: { alignItems: 'center' },
  alertaCard: { width: '100%' },
  alertaTitulo: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  alertaData: { color: theme.colors.textMuted, fontSize: 14 },
  alertaInfo: { color: theme.colors.primary, fontSize: 14, fontWeight: '600' },
});
