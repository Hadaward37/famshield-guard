import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Como as notificações de pânico são críticas, mostramos alerta + som mesmo em
// foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Canal Android dedicado ao pânico — máxima prioridade e vibração. */
async function ensurePanicChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('panico', {
    name: 'Alertas de pânico',
    importance: Notifications.AndroidImportance.MAX,
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

/**
 * Solicita permissão de notificações. Retorna false (sem throw) se recusada.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensurePanicChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    return status === 'granted';
  } catch (e) {
    if (__DEV__) console.warn('[notifications] erro ao pedir permissão:', e);
    return false;
  }
}

/** Lê o EAS projectId necessário para gerar o Expo push token. */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Fallback para o campo exposto em alguns runtimes.
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * Registra o Expo push token do dispositivo em push_tokens.
 * Não lança exceção: sem projectId (EAS não configurado) apenas loga e retorna.
 */
export async function registerPushToken(): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      if (__DEV__) console.warn('[notifications] permissão de push negada');
      return;
    }

    const projectId = getProjectId();
    if (!projectId) {
      if (__DEV__) {
        console.warn(
          '[notifications] EAS projectId ausente — rode `eas init`. ' +
            'Push token não será registrado neste ambiente.',
        );
      }
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoToken = tokenResponse.data;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;

    const plataforma = Platform.OS === 'ios' ? 'ios' : 'android';
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_token: expoToken,
        plataforma,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_token' },
    );
    if (error && __DEV__) {
      console.warn('[notifications] falha ao salvar push token:', error.message);
    }
  } catch (e) {
    // Em emulador sem Google Play / sem google-services.json isso pode falhar.
    if (__DEV__) console.warn('[notifications] registerPushToken falhou:', e);
  }
}

let receivedSub: Notifications.EventSubscription | null = null;
let responseSub: Notifications.EventSubscription | null = null;

/** Configura listeners de notificação. Idempotente. */
export function setupNotificationHandlers(): void {
  receivedSub?.remove();
  responseSub?.remove();

  receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) {
      console.log('[notifications] recebida:', notification.request.content.title);
    }
  });

  responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      tipo?: string;
      evento_id?: string;
    };
    if (data?.tipo === 'panico') {
      // TODO: navegar para a tela de histórico/detalhe do evento (data.evento_id).
      if (__DEV__) console.log('[notifications] tap em alerta de pânico:', data.evento_id);
    }
  });
}
