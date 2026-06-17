import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import type { Coords } from './location';

const BUCKET = 'panic-photos';

/**
 * Cria o registro do evento de pânico (sem foto ainda) e retorna o id.
 * A localização é best-effort: pode vir null.
 */
export async function criarEvento(
  userId: string,
  coords: Coords | null,
): Promise<string> {
  const { data, error } = await supabase
    .from('eventos_panico')
    .insert({
      user_id: userId,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Faz upload da foto (base64) para o bucket privado e grava foto_url no evento.
 * Retorna o path salvo, ou null em caso de falha (não derruba o fluxo).
 */
export async function uploadFotoPanico(
  userId: string,
  eventoId: string,
  base64: string,
): Promise<string | null> {
  try {
    const path = `${userId}/${eventoId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    await supabase.from('eventos_panico').update({ foto_url: path }).eq('id', eventoId);
    return path;
  } catch (e) {
    if (__DEV__) console.warn('[panic] upload de foto falhou:', e);
    return null;
  }
}

export interface ResultadoNotificacao {
  /** Contatos alcançados por push (têm o app). */
  push: number;
  /** Contatos alcançados por SMS de fallback (sem o app). */
  sms: number;
}

/**
 * Chama a Edge Function que notifica o círculo de confiança (push + SMS fallback).
 * Retorna a contagem por canal (0 se nada/erro controlado).
 */
export async function notificarCirculo(eventoId: string): Promise<ResultadoNotificacao> {
  const { data, error } = await supabase.functions.invoke('notificar-circulo', {
    body: { evento_id: eventoId },
  });
  if (error) throw error;
  const r = data as { notificados?: number; sms_enviados?: number };
  return { push: r?.notificados ?? 0, sms: r?.sms_enviados ?? 0 };
}

/** Marca um evento como cancelado (falso alarme durante a contagem). */
export async function cancelarEvento(eventoId: string): Promise<void> {
  await supabase.from('eventos_panico').update({ cancelado: true }).eq('id', eventoId);
}
