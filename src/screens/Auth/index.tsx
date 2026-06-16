import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Screen, Title, Body, Field, PrimaryButton, GhostButton, ErrorText } from '../../components/ui';
import { theme } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import {
  maskPhoneBR,
  isValidPhoneBR,
  isValidEmail,
  normalizePhoneBR,
  translateAuthError,
} from '../../utils/format';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  function toggleMode() {
    setMode(isSignup ? 'login' : 'signup');
    setErro('');
  }

  function validate(): string | null {
    if (!isValidEmail(email)) return 'Informe um e-mail válido.';
    if (senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (isSignup) {
      if (nome.trim().length < 2) return 'Informe seu nome.';
      if (!isValidPhoneBR(telefone)) return 'Informe um telefone válido com DDD.';
      if (senha !== confirmarSenha) return 'As senhas não conferem.';
    }
    return null;
  }

  async function handleSubmit() {
    setErro('');
    const validationError = validate();
    if (validationError) {
      setErro(validationError);
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        });
        if (error) throw error;

        // Com a confirmação de e-mail desabilitada (MVP), o signup já gera sessão.
        // O trigger handle_new_user cria a linha em profiles; gravamos nome e telefone.
        const userId = data.user?.id;
        if (userId) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ nome: nome.trim(), telefone: normalizePhoneBR(telefone) })
            .eq('id', userId);
          if (profileError) throw profileError;
        }
        // Sem sessão imediata => confirmação de e-mail ainda está ligada no projeto.
        if (!data.session) {
          setErro(
            'Conta criada, mas é preciso confirmar o e-mail. Desabilite a confirmação de e-mail no painel do Supabase para o MVP.',
          );
        }
        // Se houver sessão, o AuthProvider detecta e o RootNavigator troca de stack.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        });
        if (error) throw error;
      }
    } catch (e) {
      setErro(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>{isSignup ? 'Criar conta' : 'Entrar'}</Title>
      <Body muted>
        {isSignup
          ? 'Leva menos de um minuto. Seus dados são protegidos.'
          : 'Bem-vindo de volta. Acesse sua conta para continuar.'}
      </Body>

      <View style={styles.tabs}>
        <TabButton label="Entrar" active={!isSignup} onPress={() => !isSignup || toggleMode()} />
        <TabButton label="Criar conta" active={isSignup} onPress={() => isSignup || toggleMode()} />
      </View>

      {isSignup && (
        <>
          <Field
            label="Nome"
            value={nome}
            onChangeText={setNome}
            placeholder="Como devemos te chamar"
            autoCapitalize="words"
          />
          <Field
            label="Telefone"
            value={telefone}
            onChangeText={(t) => setTelefone(maskPhoneBR(t))}
            placeholder="(11) 90000-0000"
            keyboardType="phone-pad"
          />
        </>
      )}

      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label="Senha"
        value={senha}
        onChangeText={setSenha}
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
      />
      {isSignup && (
        <Field
          label="Confirmar senha"
          value={confirmarSenha}
          onChangeText={setConfirmarSenha}
          placeholder="Repita a senha"
          secureTextEntry
        />
      )}

      <ErrorText>{erro}</ErrorText>

      <PrimaryButton
        title={isSignup ? 'Criar conta' : 'Entrar'}
        onPress={handleSubmit}
        loading={loading}
      />
      <GhostButton
        title={isSignup ? 'Já tenho conta — Entrar' : 'Não tenho conta — Criar'}
        onPress={toggleMode}
      />
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: '#06121A' },
});
