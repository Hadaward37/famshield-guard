/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Normaliza um telefone BR para o formato nacional canônico (DDD + número, 10–11
 * dígitos), removendo o código de país +55 quando presente.
 *
 * É o formato usado para GRAVAR telefones (profiles e círculo) e para CASAR contatos
 * com perfis na notificação de pânico. Sem isso, "+55 11 9..." e "11 9..." não batem
 * e ninguém é notificado. Deve ficar idêntico à normalização da Edge Function.
 */
export function normalizePhoneBR(input: string): string {
  let d = onlyDigits(input);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    d = d.slice(2);
  }
  return d;
}

/**
 * Máscara de telefone brasileiro.
 * Celular: (XX) XXXXX-XXXX | Fixo: (XX) XXXX-XXXX
 */
export function maskPhoneBR(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Valida se o telefone tem ao menos 10 dígitos (DDD + número). */
export function isValidPhoneBR(input: string): boolean {
  const d = onlyDigits(input);
  return d.length >= 10 && d.length <= 11;
}

/** Validação simples de e-mail. */
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/**
 * Converte erros (auth e rede) em mensagens legíveis em pt-BR.
 * Nunca expõe stack trace cru ao usuário.
 */
export function translateAuthError(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? '');
  const m = raw.toLowerCase();

  if (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists')
  ) {
    return 'Este e-mail já está cadastrado. Tente entrar.';
  }
  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (
    m.includes('password') &&
    (m.includes('at least') || m.includes('should be') || m.includes('weak') || m.includes('6 char'))
  ) {
    return 'Senha fraca. Use pelo menos 6 caracteres.';
  }
  if (m.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado.';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('invalid format')) {
    return 'E-mail inválido.';
  }
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('failed to fetch') ||
    m.includes('timeout') ||
    m.includes('timed out')
  ) {
    return 'Sem conexão com a internet. Verifique sua rede e tente de novo.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  }
  return 'Algo deu errado. Tente novamente.';
}
