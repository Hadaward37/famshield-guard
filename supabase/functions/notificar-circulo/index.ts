// Edge Function: notificar-circulo
// Recebe { evento_id }, valida o dono, e dispara o alerta ao circulo de confianca:
//  - PUSH (Expo) para contatos que usam o app (com localizacao + foto na notificacao);
//  - SMS de FALLBACK para contatos que NAO tem o app (notificar_sms = true), via provedor
//    configurado por secrets (Twilio). Sem secrets, o SMS e pulado sem quebrar o fluxo.
//
// JWT E VERIFICADO. Deploy: supabase functions deploy notificar-circulo
//
// Secrets de SMS (opcionais): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (E.164).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BUCKET = 'panic-photos';
const FOTO_TTL_SEGUNDOS = 60 * 60 * 24;

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: string;
  priority: string;
  channelId: string;
}

interface Contato {
  telefone: string;
  notificar_sms: boolean | null;
  ordem: number | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Normaliza telefone BR ao formato nacional (DDD + numero, sem +55). Identica ao app.
function normalizePhone(input: string | null | undefined): string {
  let d = (input ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
}

// Telefone nacional -> E.164 BR (+55DDDNUMERO).
function toE164BR(nacional: string): string {
  return `+55${nacional}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Envia um SMS via Twilio. Retorna false se o provedor nao esta configurado ou falhou.
async function enviarSMS(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || !from) return false; // provedor nao configurado
  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${sid}:${token}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      },
    );
    return resp.ok;
  } catch (e) {
    console.error('[sms] erro ao enviar:', e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Metodo nao permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json(401, { error: 'Nao autenticado' });

  let eventoId: string | undefined;
  try {
    eventoId = (await req.json())?.evento_id;
  } catch {
    return json(400, { error: 'Body invalido' });
  }
  if (!eventoId) return json(400, { error: 'evento_id e obrigatorio' });

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1) Valida o evento e le dados para o alerta.
  const { data: evento, error: eventoErr } = await admin
    .from('eventos_panico')
    .select('id, user_id, latitude, longitude, foto_url')
    .eq('id', eventoId)
    .maybeSingle();
  if (eventoErr) return json(500, { error: 'Falha ao ler evento' });
  if (!evento) return json(404, { error: 'Evento nao encontrado' });
  if (evento.user_id !== user.id) return json(403, { error: 'Evento nao pertence ao usuario' });

  // 2) Nome do remetente + flag de SMS no consentimento.
  const [{ data: perfil }, { data: config }] = await Promise.all([
    admin.from('profiles').select('nome').eq('id', user.id).maybeSingle(),
    admin
      .from('configuracao_panico')
      .select('sms_fallback')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const nomeRemetente = perfil?.nome || 'Um contato';
  const smsPermitido = config?.sms_fallback === true;

  // 3) Localizacao (mapa) + foto assinada (24h) -> torna o alerta acionavel.
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

  // 4) Contatos do circulo.
  const { data: contatosRaw } = await admin
    .from('circulo_confianca')
    .select('telefone, notificar_sms, ordem')
    .eq('user_id', user.id)
    .order('ordem', { ascending: true });
  const contatos: Contato[] = (contatosRaw ?? []) as Contato[];

  const telefones = [
    ...new Set(
      contatos.map((c) => normalizePhone(c.telefone)).filter((t) => t.length >= 10),
    ),
  ];
  if (telefones.length === 0) return json(200, { notificados: 0, sms_enviados: 0 });

  // 5) Quais contatos usam o app (match por telefone).
  const { data: perfis } = await admin
    .from('profiles')
    .select('id, telefone')
    .in('telefone', telefones);

  const telefonesComApp = new Set(
    (perfis ?? []).map((p: { telefone: string | null }) => normalizePhone(p.telefone)),
  );
  const matchedUserIds = (perfis ?? [])
    .map((p: { id: string }) => p.id)
    .filter((id: string) => id !== user.id);

  // 6) PUSH para quem tem o app.
  let notificados = 0;
  if (matchedUserIds.length > 0) {
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('expo_token')
      .in('user_id', matchedUserIds);
    const expoTokens = (tokens ?? []).map((t: { expo_token: string }) => t.expo_token);

    if (expoTokens.length > 0) {
      const corpoLocal = mapsUrl ? `\nLocalizacao: ${mapsUrl}` : '\nLocalizacao indisponivel.';
      const messages: ExpoMessage[] = expoTokens.map((to: string) => ({
        to,
        title: '\u{1F6A8} Emergencia - FamShield',
        body: `${nomeRemetente} acionou o alerta de panico.${corpoLocal}`,
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

      try {
        for (const lote of chunk(messages, 100)) {
          const resp = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
            },
            body: JSON.stringify(lote),
          });
          const result = await resp.json().catch(() => null);
          const tickets = result?.data;
          if (Array.isArray(tickets)) {
            notificados += tickets.filter((t: { status?: string }) => t?.status === 'ok').length;
          }
        }
      } catch (e) {
        console.error('[notificar-circulo] erro ao enviar push:', e);
      }
    }
  }

  // 7) SMS de FALLBACK para contatos SEM o app (e que aceitam SMS), se o usuario
  //    consentiu (sms_fallback) e o provedor esta configurado.
  let smsEnviados = 0;
  if (smsPermitido) {
    const corpoSms =
      `FamShield: ${nomeRemetente} acionou um alerta de emergencia.` +
      (mapsUrl ? ` Local: ${mapsUrl}` : '');
    const destinatarios = [
      ...new Set(
        contatos
          .filter((c) => c.notificar_sms !== false)
          .map((c) => normalizePhone(c.telefone))
          .filter((t) => t.length >= 10 && !telefonesComApp.has(t)),
      ),
    ];
    for (const nacional of destinatarios) {
      if (await enviarSMS(toE164BR(nacional), corpoSms)) smsEnviados++;
    }
  }

  // 8) Atualiza contador (best-effort).
  await admin
    .from('eventos_panico')
    .update({ notificacoes_enviadas: notificados })
    .eq('id', eventoId);

  return json(200, { notificados, sms_enviados: smsEnviados });
});
