// Edge Function: notificar-circulo
// Recebe { evento_id }, valida o dono do evento, casa os contatos do círculo de
// confiança com usuários do app (por telefone normalizado), e dispara notificações
// ACIONÁVEIS (com localização em mapa + foto assinada) pela Expo Push API.
//
// JWT É VERIFICADO (não usar --no-verify-jwt). O caller precisa estar autenticado.
//
// Deploy: supabase functions deploy notificar-circulo
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BUCKET = 'panic-photos';
const FOTO_TTL_SEGUNDOS = 60 * 60 * 24; // 24h

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: string;
  priority: string;
  channelId: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Normaliza telefone BR para o formato nacional canônico (DDD + número), removendo o
 * código de país +55 quando presente. DEVE ser idêntica a normalizePhoneBR do app
 * (src/utils/format.ts) — o match de notificação depende dessa consistência.
 */
function normalizePhone(input: string | null | undefined): string {
  let d = (input ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    d = d.slice(2);
  }
  return d;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identifica o caller a partir do JWT enviado no header Authorization.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(401, { error: 'Não autenticado' });
  }

  let eventoId: string | undefined;
  try {
    const body = await req.json();
    eventoId = body?.evento_id;
  } catch {
    return json(400, { error: 'Body inválido' });
  }
  if (!eventoId) {
    return json(400, { error: 'evento_id é obrigatório' });
  }

  // Cliente admin (service role) para ler dados de outros usuários (contatos).
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1) Valida que o evento pertence ao caller (e lê dados para o alerta).
  const { data: evento, error: eventoErr } = await admin
    .from('eventos_panico')
    .select('id, user_id, latitude, longitude, foto_url')
    .eq('id', eventoId)
    .maybeSingle();
  if (eventoErr) return json(500, { error: 'Falha ao ler evento' });
  if (!evento) return json(404, { error: 'Evento não encontrado' });
  if (evento.user_id !== user.id) {
    return json(403, { error: 'Evento não pertence ao usuário' });
  }

  // 2) Nome do remetente.
  const { data: perfil } = await admin
    .from('profiles')
    .select('nome')
    .eq('id', user.id)
    .maybeSingle();
  const nomeRemetente = perfil?.nome || 'Um contato';

  // 3) Monta a localização (link de mapa) e a foto (URL assinada de 24h) — é isso que
  //    torna o alerta ACIONÁVEL para quem recebe.
  const temGeo =
    typeof evento.latitude === 'number' && typeof evento.longitude === 'number';
  const mapsUrl = temGeo
    ? `https://www.google.com/maps/search/?api=1&query=${evento.latitude},${evento.longitude}`
    : null;

  let fotoUrl: string | null = null;
  if (evento.foto_url) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(evento.foto_url, FOTO_TTL_SEGUNDOS);
    fotoUrl = signed?.signedUrl ?? null;
  }

  // 4) Contatos do círculo (por prioridade) -> telefones normalizados.
  const { data: contatos } = await admin
    .from('circulo_confianca')
    .select('telefone, ordem')
    .eq('user_id', user.id)
    .order('ordem', { ascending: true });

  const telefones = [
    ...new Set(
      (contatos ?? [])
        .map((c: { telefone: string }) => normalizePhone(c.telefone))
        .filter((t: string) => t.length >= 10),
    ),
  ];
  if (telefones.length === 0) {
    return json(200, { notificados: 0 });
  }

  // 5) Casa telefones com usuários do app — query direcionada (sem varrer todos os
  //    perfis). Telefones são gravados já normalizados no app.
  const { data: perfis } = await admin
    .from('profiles')
    .select('id, telefone')
    .in('telefone', telefones);

  const matchedUserIds = (perfis ?? [])
    .map((p: { id: string }) => p.id)
    .filter((id: string) => id !== user.id);

  if (matchedUserIds.length === 0) {
    return json(200, { notificados: 0 });
  }

  // 6) Push tokens dos contatos casados.
  const { data: tokens } = await admin
    .from('push_tokens')
    .select('expo_token')
    .in('user_id', matchedUserIds);

  const expoTokens = (tokens ?? []).map(
    (t: { expo_token: string }) => t.expo_token,
  );
  if (expoTokens.length === 0) {
    return json(200, { notificados: 0 });
  }

  const corpoLocal = mapsUrl
    ? `\nLocalização: ${mapsUrl}`
    : '\nLocalização indisponível.';

  const messages: ExpoMessage[] = expoTokens.map((to: string) => ({
    to,
    title: '🚨 Emergência — FamShield',
    body: `${nomeRemetente} acionou o alerta de pânico.${corpoLocal}`,
    data: {
      evento_id: eventoId,
      tipo: 'panico',
      remetente: nomeRemetente,
      latitude: evento.latitude,
      longitude: evento.longitude,
      maps_url: mapsUrl,
      foto_url: fotoUrl,
    },
    sound: 'default',
    priority: 'high',
    channelId: 'panico',
  }));

  // 7) Envia em chunks de 100. Nunca derruba a função por erro de push.
  let notificados = 0;
  try {
    for (const lote of chunk(messages, 100)) {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(lote),
      });
      const result = await resp.json().catch(() => null);
      const tickets = result?.data;
      if (Array.isArray(tickets)) {
        notificados += tickets.filter(
          (t: { status?: string }) => t?.status === 'ok',
        ).length;
      }
    }
  } catch (e) {
    console.error('[notificar-circulo] erro ao enviar push:', e);
    notificados = 0;
  }

  // 8) Atualiza o contador no evento (best-effort).
  await admin
    .from('eventos_panico')
    .update({ notificacoes_enviadas: notificados })
    .eq('id', eventoId);

  return json(200, { notificados });
});
