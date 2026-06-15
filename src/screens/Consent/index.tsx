import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Screen,
  Title,
  Subtitle,
  Body,
  ToggleRow,
  PrimaryButton,
  ErrorText,
  Card,
} from '../../components/ui';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { translateAuthError } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Consent'>;

export default function ConsentScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [localizacao, setLocalizacao] = useState(true);
  const [foto, setFoto] = useState(true);
  const [sms, setSms] = useState(true);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setErro('');
    if (!session) {
      setErro('Sessão expirada. Entre novamente.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('configuracao_panico').upsert(
        {
          user_id: session.user.id,
          consentimento_lgpd: true,
          consentimento_data: new Date().toISOString(),
          compartilhar_localizacao: localizacao,
          capturar_foto: foto,
          sms_fallback: sms,
          gesture_tipo: null, // definido no Prompt #3
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      navigation.navigate('Circle');
    } catch (e) {
      setErro(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Sua privacidade, no controle</Title>
      <Body muted>
        O FamShield só usa seus dados durante um incidente que você mesmo acionar.
        Você escolhe o que permitir — e pode mudar depois.
      </Body>

      <Card>
        <Subtitle>O que coletamos e por quê</Subtitle>
        <Body>
          • <Body muted>Localização em tempo real</Body> — só durante um incidente, para
          seu círculo saber onde você está.
        </Body>
        <Body>
          • <Body muted>Foto frontal</Body> — registrada no momento do acionamento, para
          ajudar a comprovar uma possível coação.
        </Body>
        <Body>
          • <Body muted>Acionar seus contatos</Body> — por push e/ou SMS, para pedir
          ajuda automaticamente.
        </Body>
      </Card>

      <ToggleRow
        label="Li e aceito os Termos e a Política de Privacidade"
        description="Obrigatório para usar o app."
        value={aceitouTermos}
        onValueChange={setAceitouTermos}
        required
      />
      <ToggleRow
        label="Permitir localização durante incidentes"
        description="Recomendado. Compartilha sua posição com o círculo de confiança."
        value={localizacao}
        onValueChange={setLocalizacao}
      />
      <ToggleRow
        label="Permitir captura de foto durante incidentes"
        description="Recomendado. Registra uma foto frontal ao acionar o pânico."
        value={foto}
        onValueChange={setFoto}
      />
      <ToggleRow
        label="Permitir SMS de emergência aos contatos"
        description="Recomendado. Garante o alerta mesmo sem internet."
        value={sms}
        onValueChange={setSms}
      />

      <View style={styles.spacer} />
      <ErrorText>{erro}</ErrorText>
      <PrimaryButton
        title="Continuar"
        onPress={handleContinue}
        disabled={!aceitouTermos}
        loading={loading}
      />
      <Body muted>
        Os itens recomendados são opcionais (LGPD: consentimento livre e granular). O app
        funciona mesmo se você deixá-los desligados.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 4 },
});
