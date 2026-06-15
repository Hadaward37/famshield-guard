import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import {
  Screen,
  Title,
  Body,
  Subtitle,
  Field,
  ToggleRow,
  PrimaryButton,
  GhostButton,
  ErrorText,
  Card,
} from '../../components/ui';
import { theme } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { maskPhoneBR, isValidPhoneBR, onlyDigits, translateAuthError } from '../../utils/format';

interface Contato {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  notificar_push: boolean;
  notificar_sms: boolean;
  ordem: number;
}

export default function CircleScreen() {
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id;

  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [erro, setErro] = useState('');

  // formulário
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [notificarPush, setNotificarPush] = useState(true);
  const [notificarSms, setNotificarSms] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from('circulo_confianca')
      .select('id, nome, telefone, email, notificar_push, notificar_sms, ordem')
      .eq('user_id', userId)
      .order('ordem', { ascending: true });
    if (!error && data) setContatos(data as Contato[]);
    setLoadingList(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setNome('');
    setTelefone('');
    setEmail('');
    setNotificarPush(true);
    setNotificarSms(true);
  }

  function startEdit(c: Contato) {
    setEditingId(c.id);
    setNome(c.nome);
    setTelefone(maskPhoneBR(c.telefone));
    setEmail(c.email ?? '');
    setNotificarPush(c.notificar_push);
    setNotificarSms(c.notificar_sms);
  }

  async function handleSave() {
    setErro('');
    if (!userId) {
      setErro('Sessão expirada. Entre novamente.');
      return;
    }
    if (nome.trim().length < 2) {
      setErro('Informe o nome do contato.');
      return;
    }
    if (!isValidPhoneBR(telefone)) {
      setErro('Informe um telefone válido com DDD.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nome: nome.trim(),
        telefone: onlyDigits(telefone),
        email: email.trim() || null,
        notificar_push: notificarPush,
        notificar_sms: notificarSms,
      };
      if (editingId) {
        const { error } = await supabase
          .from('circulo_confianca')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('circulo_confianca').insert({
          ...payload,
          user_id: userId,
          ordem: contatos.length + 1,
        });
        if (error) throw error;
      }
      resetForm();
      await load();
    } catch (e) {
      setErro(translateAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(c: Contato) {
    Alert.alert('Remover contato', `Remover ${c.nome} do círculo de confiança?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setErro('');
          const { error } = await supabase.from('circulo_confianca').delete().eq('id', c.id);
          if (error) {
            setErro(translateAuthError(error));
            return;
          }
          if (editingId === c.id) resetForm();
          await load();
        },
      },
    ]);
  }

  // Troca a ordem (prioridade) com o vizinho. Primeiro da lista = prioridade 1.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= contatos.length) return;
    const a = contatos[index];
    const b = contatos[target];
    setErro('');
    const { error } = await supabase
      .from('circulo_confianca')
      .upsert([
        { id: a.id, ordem: b.ordem },
        { id: b.id, ordem: a.ordem },
      ]);
    if (error) {
      setErro(translateAuthError(error));
      return;
    }
    await load();
  }

  async function handleFinish() {
    setErro('');
    if (contatos.length < 1) {
      setErro('Adicione pelo menos 1 contato de confiança para concluir.');
      return;
    }
    if (!userId) {
      setErro('Sessão expirada. Entre novamente.');
      return;
    }
    setFinishing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completo: true })
        .eq('id', userId);
      if (error) throw error;
      // Atualiza o estado global -> RootNavigator troca para a Home automaticamente.
      await refreshProfile();
    } catch (e) {
      setErro(translateAuthError(e));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <Screen>
      <Title>Círculo de confiança</Title>
      <Body muted>
        Quem será avisado se você acionar o pânico. A ordem define a prioridade — o
        primeiro é o contato principal.
      </Body>

      {loadingList ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
      ) : contatos.length === 0 ? (
        <Card>
          <Body muted>Nenhum contato ainda. Adicione o primeiro abaixo.</Body>
        </Card>
      ) : (
        contatos.map((c, i) => (
          <Card key={c.id}>
            <View style={styles.contatoHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contatoNome}>
                  {i + 1}. {c.nome}
                </Text>
                <Text style={styles.contatoTel}>{maskPhoneBR(c.telefone)}</Text>
                {c.email ? <Text style={styles.contatoTel}>{c.email}</Text> : null}
                <Text style={styles.contatoMeta}>
                  {c.notificar_push ? 'Push' : ''}
                  {c.notificar_push && c.notificar_sms ? ' · ' : ''}
                  {c.notificar_sms ? 'SMS' : ''}
                  {!c.notificar_push && !c.notificar_sms ? 'Sem notificações' : ''}
                </Text>
              </View>
              <View style={styles.orderBtns}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={styles.iconBtn}>
                  <Text style={[styles.iconText, i === 0 && styles.iconDisabled]}>▲</Text>
                </Pressable>
                <Pressable
                  onPress={() => move(i, 1)}
                  disabled={i === contatos.length - 1}
                  style={styles.iconBtn}
                >
                  <Text
                    style={[styles.iconText, i === contatos.length - 1 && styles.iconDisabled]}
                  >
                    ▼
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actionRow}>
              <GhostButton title="Editar" onPress={() => startEdit(c)} />
              <Pressable onPress={() => handleRemove(c)}>
                <Text style={styles.removeText}>Remover</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <View style={styles.divider} />

      <Subtitle>{editingId ? 'Editar contato' : 'Adicionar contato'}</Subtitle>
      <Field label="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Maria (irmã)" autoCapitalize="words" />
      <Field
        label="Telefone"
        value={telefone}
        onChangeText={(t) => setTelefone(maskPhoneBR(t))}
        placeholder="(11) 90000-0000"
        keyboardType="phone-pad"
      />
      <Field
        label="E-mail (opcional)"
        value={email}
        onChangeText={setEmail}
        placeholder="contato@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ToggleRow label="Notificar por push" value={notificarPush} onValueChange={setNotificarPush} />
      <ToggleRow label="Notificar por SMS" value={notificarSms} onValueChange={setNotificarSms} />

      <ErrorText>{erro}</ErrorText>
      <PrimaryButton
        title={editingId ? 'Salvar alterações' : 'Adicionar contato'}
        onPress={handleSave}
        loading={saving}
      />
      {editingId ? <GhostButton title="Cancelar edição" onPress={resetForm} /> : null}

      <View style={styles.divider} />

      <PrimaryButton
        title="Concluir"
        onPress={handleFinish}
        loading={finishing}
        disabled={contatos.length < 1}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  contatoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  contatoNome: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  contatoTel: { color: theme.colors.textMuted, fontSize: 14, marginTop: 2 },
  contatoMeta: { color: theme.colors.primary, fontSize: 12, marginTop: 4 },
  orderBtns: { gap: 4 },
  iconBtn: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconText: { color: theme.colors.text, fontSize: 12 },
  iconDisabled: { color: theme.colors.border },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  removeText: { color: theme.colors.danger, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8 },
});
