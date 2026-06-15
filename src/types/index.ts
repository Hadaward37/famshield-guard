export interface Profile {
  id: string;
  telefone?: string;
  plano: 'free' | 'basic' | 'pro';
  trial_expira_em: string;
  fcm_token?: string;
  created_at: string;
}
export interface CirculoConfianca {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  email?: string;
  notificar_push: boolean;
  notificar_sms: boolean;
  ordem: number;
}
export interface BancoUsuario {
  id: string;
  user_id: string;
  nome_banco: string;
  prioridade: number;
}
export interface Incidente {
  id: string;
  user_id: string;
  tipo: 'panico_manual' | 'panico_gesture' | 'snatch_detect';
  latitude?: number;
  longitude?: number;
  foto_url?: string;
  status: 'ativo' | 'encerrado' | 'falso_alarme';
  encerrado_em?: string;
  created_at: string;
}
