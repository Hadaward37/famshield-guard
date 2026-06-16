import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { theme } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { requestLocationPermission, getCurrentLocation, type Coords } from '../../services/location';
import {
  criarEvento,
  uploadFotoPanico,
  notificarCirculo,
  cancelarEvento,
} from '../../services/panic';

type PanicStatus =
  | 'IDLE'
  | 'COUNTDOWN'
  | 'REQUESTING_PERMISSIONS'
  | 'CAPTURING_LOCATION'
  | 'CAMERA'
  | 'UPLOADING'
  | 'SENDING'
  | 'DONE'
  | 'CANCELLED'
  | 'ERROR';

interface PanicFlowProps {
  visible: boolean;
  onDismiss: () => void;
}

const COUNTDOWN_FROM = 5;

export default function PanicFlow({ visible, onDismiss }: PanicFlowProps) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [status, setStatus] = useState<PanicStatus>('IDLE');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [notificados, setNotificados] = useState(0);
  const [erro, setErro] = useState('');

  const coordsRef = useRef<Coords | null>(null);
  const eventoIdRef = useRef<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Cria e envia o evento (com ou sem foto). Tolerante a falhas parciais.
  const enviar = useCallback(
    async (base64: string | null) => {
      if (!userId) {
        setErro('Sessão expirada. Entre novamente.');
        setStatus('ERROR');
        return;
      }
      try {
        setStatus('UPLOADING');
        const eventoId = await criarEvento(userId, coordsRef.current);
        eventoIdRef.current = eventoId;
        if (base64) {
          await uploadFotoPanico(userId, eventoId, base64);
        }
        setStatus('SENDING');
        const n = await notificarCirculo(eventoId);
        setNotificados(n);
        setStatus('DONE');
      } catch (e) {
        if (__DEV__) console.warn('[PanicFlow] erro ao enviar alerta:', e);
        setErro('Não foi possível concluir o envio do alerta.');
        setStatus('ERROR');
      }
    },
    [userId],
  );

  // Captura permissões + localização, depois decide se mostra a câmera.
  const prepararEEnviar = useCallback(async () => {
    setStatus('REQUESTING_PERMISSIONS');
    const locOk = await requestLocationPermission();
    const camResult = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();

    setStatus('CAPTURING_LOCATION');
    coordsRef.current = locOk ? await getCurrentLocation() : null;

    if (camResult?.granted) {
      setStatus('CAMERA');
    } else {
      // Sem câmera, segue direto sem foto — pânico nunca é bloqueado.
      await enviar(null);
    }
  }, [cameraPermission, requestCameraPermission, enviar]);

  // Inicia a contagem quando o modal abre.
  useEffect(() => {
    if (visible && status === 'IDLE') {
      setErro('');
      setNotificados(0);
      coordsRef.current = null;
      eventoIdRef.current = null;
      setCountdown(COUNTDOWN_FROM);
      setStatus('COUNTDOWN');
    }
    if (!visible && status !== 'IDLE') {
      setStatus('IDLE');
    }
  }, [visible, status]);

  // Contador regressivo cancelável.
  useEffect(() => {
    if (status !== 'COUNTDOWN') return;
    if (countdown <= 0) {
      void prepararEEnviar();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, prepararEEnviar]);

  // Fecha o modal alguns instantes após o cancelamento.
  useEffect(() => {
    if (status !== 'CANCELLED') return;
    const t = setTimeout(() => close(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function close() {
    setStatus('IDLE');
    onDismiss();
  }

  function cancelarContagem() {
    // Se já tinha evento criado (não deveria, durante a contagem), marca cancelado.
    if (eventoIdRef.current) void cancelarEvento(eventoIdRef.current);
    setStatus('CANCELLED');
  }

  async function tirarFoto() {
    try {
      const pic = await cameraRef.current?.takePictureAsync({
        quality: 0.5,
        base64: true,
      });
      await enviar(pic?.base64 ?? null);
    } catch (e) {
      if (__DEV__) console.warn('[PanicFlow] erro ao tirar foto:', e);
      await enviar(null);
    }
  }

  function retry() {
    setErro('');
    void prepararEEnviar();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {
        // Botão voltar do Android: só permite sair em estados "finais".
        if (status === 'DONE' || status === 'CANCELLED' || status === 'ERROR') close();
      }}
    >
      <View style={styles.container}>{renderContent()}</View>
    </Modal>
  );

  function renderContent() {
    switch (status) {
      case 'COUNTDOWN':
        return (
          <Pressable style={styles.countdownArea} onPress={cancelarContagem}>
            <Text style={styles.countdownLabel}>Enviando alerta em</Text>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <Text style={styles.tapCancel}>Toque em qualquer lugar para cancelar</Text>
          </Pressable>
        );

      case 'REQUESTING_PERMISSIONS':
        return <Loading texto="Preparando alerta..." />;

      case 'CAPTURING_LOCATION':
        return <Loading texto="Obtendo localização..." />;

      case 'CAMERA':
        return (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
            <View style={styles.cameraOverlay}>
              <Text style={styles.cameraHint}>
                Registre uma foto para comprovar a situação.
              </Text>
              <View style={styles.cameraButtons}>
                <Pressable style={[styles.camBtn, styles.skipBtn]} onPress={() => enviar(null)}>
                  <Text style={styles.skipText}>Pular</Text>
                </Pressable>
                <Pressable style={[styles.camBtn, styles.shootBtn]} onPress={tirarFoto}>
                  <Text style={styles.shootText}>📸 Foto</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );

      case 'UPLOADING':
        return <Loading texto="Enviando alerta..." />;

      case 'SENDING':
        return <Loading texto="Notificando contatos..." />;

      case 'DONE':
        return (
          <View style={styles.centerArea}>
            <Text style={styles.bigIcon}>✅</Text>
            <Text style={styles.doneTitle}>
              {notificados > 0
                ? `Alerta enviado para ${notificados} ${
                    notificados === 1 ? 'contato' : 'contatos'
                  }`
                : 'Alerta registrado'}
            </Text>
            {notificados === 0 && (
              <Text style={styles.doneSub}>
                Nenhum contato com o app instalado foi notificado por push. Considere
                acionar seus contatos por outro meio.
              </Text>
            )}
            <PrimaryBtn title="OK" onPress={close} />
          </View>
        );

      case 'CANCELLED':
        return (
          <View style={styles.centerArea}>
            <Text style={styles.bigIcon}>🟡</Text>
            <Text style={styles.doneTitle}>Alerta cancelado</Text>
          </View>
        );

      case 'ERROR':
        return (
          <View style={styles.centerArea}>
            <Text style={styles.bigIcon}>⚠️</Text>
            <Text style={styles.doneTitle}>{erro || 'Algo deu errado.'}</Text>
            <PrimaryBtn title="Tentar novamente" onPress={retry} />
            <Pressable onPress={close} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Fechar</Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  }
}

function Loading({ texto }: { texto: string }) {
  return (
    <View style={styles.centerArea}>
      <ActivityIndicator size="large" color={theme.colors.text} />
      <Text style={styles.loadingText}>{texto}</Text>
    </View>
  );
}

function PrimaryBtn({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryBtn} onPress={onPress}>
      <Text style={styles.primaryBtnText}>{title}</Text>
    </Pressable>
  );
}

const PANIC_BG = '#450A0A';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PANIC_BG },
  countdownArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  countdownLabel: { color: '#FCA5A5', fontSize: 20, fontWeight: '600' },
  countdownNumber: { color: '#FFFFFF', fontSize: 140, fontWeight: '800', lineHeight: 160 },
  tapCancel: { color: '#FCA5A5', fontSize: 16, marginTop: 16 },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
  bigIcon: { fontSize: 64 },
  doneTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  doneSub: { color: '#FCA5A5', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  cameraWrap: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 48,
    gap: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cameraHint: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  cameraButtons: { flexDirection: 'row', gap: 12 },
  camBtn: { flex: 1, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  skipBtn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  skipText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  shootBtn: { backgroundColor: theme.colors.primary },
  shootText: { color: '#06121A', fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    marginTop: 8,
  },
  primaryBtnText: { color: '#06121A', fontSize: 16, fontWeight: '700' },
  ghostBtn: { paddingVertical: 12 },
  ghostText: { color: '#FCA5A5', fontSize: 15, fontWeight: '600' },
});
