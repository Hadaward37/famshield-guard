# FamShield Guard — Contexto do Projeto

> Documento vivo de contexto para o Claude Code e para o founder. Resume **o que é o
> produto, a stack, o estado atual, as decisões e as pendências**. Atualize a cada prompt.
> Última atualização: **2026-06-17** — Auditoria profunda + correções: alerta agora é
> **acionável** (localização/foto na notificação), RLS/índices otimizados. Parecer de
> viabilidade e lacunas críticas na **seção 10**.

---

## 1. Produto

**FamShield Guard** — app **Android** de **defesa financeira pessoal** contra
**sequestro relâmpago** e **roubo de celular**, focado no cenário brasileiro
(coerção + Pix).

**Core:** um gesto de pânico silencioso que:
1. notifica o **círculo de confiança** (push/SMS),
2. compartilha **localização em tempo real**,
3. captura **foto frontal** (registro de coação),
4. guia o **bloqueio emergencial dos bancos** (futuro).

**Founder:** solo founder (GitHub **Hadaward37**, dudutorro1@gmail.com). Claude Code atua
como engenheiro de software escrevendo todo o código.

---

## 2. Ambiente de desenvolvimento

- **SO:** Windows 11 · **Shell:** PowerShell (sem encadear `&&` — comandos separados).
- **Pasta local:** `C:\Users\dudut\famshield-guard`
- **Hardware:** Samsung i5 11ª geração, 8GB RAM.
- **Ferramentas:** Node v25.9.0, npm 11.12.1, git 2.53.0, gh 2.89.0 (logado como Hadaward37).
- **MCP ativos:** Supabase (usado para banco/migrations/edge functions), entre outros.

---

## 3. Stack

| Camada | Tecnologia |
|---|---|
| App | Expo **SDK 56** (managed + `expo-dev-client`), React Native 0.85, React 19.2 |
| Linguagem | TypeScript (strict) — obrigatório em todos os arquivos |
| Navegação | `@react-navigation/native` + `native-stack` (v7) |
| Backend | Supabase (Auth, Postgres + RLS, Storage, Edge Functions) |
| Storage sessão | `LargeSecureStore` (expo-secure-store + AES-256 via expo-crypto/aes-js) |
| UI | Tema escuro ciano em `src/constants/theme.ts` |

> **AGENTS.md do repo:** "Expo HAS CHANGED" — ler docs versionadas
> https://docs.expo.dev/versions/v56.0.0/ **antes** de escrever código. Não confiar na
> memória para sintaxe de APIs nativas.

---

## 4. Supabase

- **Projeto:** `famshield-guard` · **ref `fpctuawtqdwhuflsofqa`**
- **Org:** `Hadaward37's Org` (`felfbqourtoqzomuvamp`) · **região** `sa-east-1` (São Paulo)
- **Plano:** free tier · **URL:** https://fpctuawtqdwhuflsofqa.supabase.co
- **Credenciais:** no `.env` (gitignored) — `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon JWT legacy).
- **Confirmação de e-mail:** DESABILITADA no painel (signup gera sessão imediata — MVP).
  Há `// TODO: reabilitar confirmação de e-mail antes do lançamento` no código.

### 4.1 Schema (todas as tabelas com RLS por `auth.uid()`)

| Tabela | Papel |
|---|---|
| `profiles` | id (=auth.users), `nome`, `telefone`, `plano`, `trial_expira_em`, `fcm_token`, `onboarding_completo` |
| `circulo_confianca` | contatos de confiança (nome, telefone, email, notificar_push/sms, `ordem` = prioridade) |
| `bancos_usuario` | bancos do usuário (prioridade) — uso futuro |
| `configuracao_panico` | consentimento LGPD + flags (localização/foto/sms), `gesture_tipo` |
| `incidentes` | (Prompt #1, legado) |
| `notificacoes_incidente` | (Prompt #1, legado) |
| `eventos_panico` | **evento real de pânico**: coords, `foto_url`, `cancelado`, `notificacoes_enviadas` |
| `push_tokens` | expo push token por dispositivo (user_id + expo_token unique, plataforma) |

> ⚠️ **Não existe** tabela `contatos_emergencia` (alguns prompts citam esse nome). A
> tabela real de contatos é **`circulo_confianca`**.
> 📞 **Telefones são gravados normalizados** (`normalizePhoneBR` em `utils/format.ts`):
> formato nacional canônico (DDD + número, sem `+55`). A Edge Function usa a MESMA
> normalização. Isso é o que faz o match de notificação funcionar — manter as duas em
> sincronia ao mexer em qualquer uma.
> ⚠️ `eventos_panico` é o fluxo ativo; `incidentes`/`notificacoes_incidente` são legados
> do Prompt #1 (mantidos, não usados pelo fluxo de pânico).

- **Trigger:** `on_auth_user_created` → `handle_new_user()` cria `profiles` no signup
  (hardened: `search_path=''`, `EXECUTE` revogado de anon/authenticated).
- **Security advisor:** 0 alertas (rodar `get_advisors` após cada DDL).

### 4.2 Storage
- Bucket **privado** `panic-photos` (limite 5 MB, `image/jpeg`/`image/png`).
- Policies de insert/select por pasta do dono. **Path:** `{user_id}/{evento_id}.jpg`.

### 4.3 Edge Function `notificar-circulo`
- **Deployada via MCP** (ACTIVE, `verify_jwt=true`). Arquivo:
  `supabase/functions/notificar-circulo/index.ts`.
- Recebe `{ evento_id }`, valida dono (403 se não), casa telefones **normalizados**
  (só dígitos) do círculo contra `profiles.telefone`, lê `push_tokens` via service role,
  envia em chunks de 100 à **Expo Push API** (`exp.host/--/api/v2/push/send`), conta
  tickets `ok`, atualiza `notificacoes_enviadas`. **Nunca falha com 500 por push** (retorna 0).

---

## 5. Estrutura do código (`src/`)

```
src/
├── navigation/RootNavigator.tsx   # auth gate: sessão + onboarding_completo
├── screens/
│   ├── Welcome/       # proposta de valor + CTA
│   ├── Auth/          # entrar / criar conta (nome+telefone), erros pt-BR
│   ├── Consent/       # LGPD granular -> upsert configuracao_panico
│   ├── Circle/        # CRUD círculo de confiança + reordenar -> conclui onboarding
│   ├── Home/          # PanicButton + PanicFlow + UltimoAlertaCard
│   ├── Panic/
│   │   ├── index.tsx      # placeholder de rota (não usado pelo fluxo)
│   │   └── PanicFlow.tsx  # MODAL: máquina de estados do pânico
│   └── Recovery/      # placeholder (bloqueio bancário — futuro)
├── components/
│   ├── ui.tsx         # primitivos: Screen, Field, PrimaryButton, ToggleRow, Card...
│   └── PanicButton.tsx# botão SOS (long-press 3s, anel SVG, haptics)
├── services/
│   ├── supabase.ts    # client (LargeSecureStore + AppState autoRefresh)
│   ├── secureStorage.ts# LargeSecureStore (SecureStore + AES)
│   ├── notifications.ts# canal Android, push token, handlers
│   ├── location.ts    # permissão + getCurrentLocation (timeout 10s)
│   └── panic.ts        # criarEvento / uploadFotoPanico / notificarCirculo / cancelarEvento
├── hooks/useAuth.tsx  # AuthProvider: session + profile + registerPushToken
├── utils/format.ts    # máscara telefone BR, validações, translateAuthError (pt-BR)
├── types/index.ts     # interfaces de domínio
└── constants/theme.ts # cores
```

### Roteamento (RootNavigator)
- **sem sessão** → `Welcome` / `Auth`
- **sessão + `onboarding_completo=false`** → `Consent` / `Circle`
- **sessão + `onboarding_completo=true`** → `Home` / `Panic` / `Recovery`
- Splash enquanto resolve (sem flicker; troca de stack reativa).

### PanicFlow — máquina de estados
`IDLE → COUNTDOWN (5s cancelável) → REQUESTING_PERMISSIONS → CAPTURING_LOCATION →
CAMERA (CameraView front; Foto/Pular) → UPLOADING → SENDING → DONE | CANCELLED | ERROR`.
Insert do evento → upload da foto → Edge Function. `DONE` aparece mesmo com 0 notificados.
Nenhum estado exige reiniciar o app.

---

## 6. Progresso por prompt

- **Prompt #1 ✅** — Setup: Expo + Supabase (schema base + RLS + trigger), GitHub, validação.
- **Prompt #2 ✅** — Onboarding: auth, consentimento LGPD, círculo de confiança, Home.
  Cliente Supabase com sessão persistente (AsyncStorage → depois migrado).
- **Prompt #3 ✅** — Fluxo de pânico: PanicButton, PanicFlow, serviços (location,
  notifications, panic), Edge Function, migrations (eventos_panico, push_tokens), bucket,
  LargeSecureStore, configs de dev build.
- **Prompt #4 ✅ CONCLUÍDO + VALIDADO E2E** — Onboarding de dev/teste: README com
  **Firebase Setup**, **Gerando o Development Build** e **Roteiro de Teste E2E** (fluxo de
  pânico). Fix: suprimido `RECORD_AUDIO` do plugin expo-camera (`recordAudioAndroid: false`).
  > **Validado em teste real (2 contas físicas), não só código (2026-06-17):**
  > long-press 3s disparou o fluxo até `DONE`; localização gravada (lat/long em
  > `eventos_panico`); foto enviada ao bucket `panic-photos`; **push FCM V1 entregue** no
  > celular do membro do círculo; registro completo em `eventos_panico` (com o fix de
  > telefone do commit `f536368` em ação). Dev build via EAS + `eas-build-pre-install`
  > hook para `google-services.json` funcionando.

**Commits recentes:**
- `feat: setup inicial FamShield Guard (expo + supabase + navigation)`
- `feat: onboarding (auth + consentimento LGPD + círculo de confiança)`
- `refactor: migrate session storage to LargeSecureStore`
- `feat: panic flow (gesture + location + camera + push notification)`
- `fix: normalizar telefones (DDD canônico, sem +55) no app e na Edge Function`
- `fix: suppress RECORD_AUDIO permission from expo-camera plugin`
- `docs: firebase setup, dev build instructions, E2E test roteiro`
- `chore: link project to EAS (eas init)`
- `chore: all manual setup completed (firebase + eas + fcm v1)`
- `fix: write google-services.json via eas-build-pre-install hook`

Repo: **https://github.com/Hadaward37/famshield-guard** (público, branch `main`).

---

## 7. Pendências manuais do founder (fora do CLI/MCP)

- [x] **Firebase**: projeto criado + app Android `com.famshield.guard`;
      `google-services.json` na raiz (gitignored) — Prompt #5.
- [x] **`google-services.json` via EAS file secret**: `app.json` →
      `android.googleServicesFile: "$GOOGLE_SERVICES_JSON"`; o file secret
      `GOOGLE_SERVICES_JSON` **já existe** no projeto EAS (criado via `eas secret:create`),
      injetado no build — **não recriar** (atualizar com `--force`; conferir com
      `eas secret:list`). Arquivo local serve só para build local/`prebuild`.
- [x] **FCM V1 key** enviada ao EAS (Credentials) — Expo Push já entrega no Android (Prompt #5).
- [x] **`eas init`** → `extra.eas.projectId` = `0635a0a2-3d7d-4272-b336-48c7bd9a36f1`,
      `owner: "famshield"` no `app.json` (Prompt #5). Push token já pode ser gerado.
- [x] Desabilitar "Confirm email" no painel Supabase (Prompt #2).
- [x] Deploy da Edge Function `notificar-circulo` (feito via MCP — não precisa CLI).
- [x] Suprimir `RECORD_AUDIO` do plugin expo-camera (Prompt #4 — `recordAudioAndroid: false`).

> A partir do Prompt #3, **Expo Go não basta** — usar **development build**:
> `eas build --profile development --platform android` e depois `npx expo start --dev-client`.

---

## 8. Convenções e regras de trabalho

- **TypeScript obrigatório**; rodar `npx tsc --noEmit` após cada bloco que mexe em .ts/.tsx.
- **Android first** — NÃO configurar iOS. **NÃO rodar `prebuild`** nem `eas build` sem pedido.
- **PowerShell**: comandos separados, sem `&&`. Instalar deps de uma a uma (regra dos #1/#2).
- **Validação de bundle** sem device: subir Metro e requisitar
  `http://localhost:8081/index.bundle?platform=android&dev=true` (esperar HTTP 200).
- **Segurança é o produto**: RLS sempre, advisor 0 alertas, dados só durante incidente,
  consentimento LGPD granular, sessão criptografada.
- Se algo falhar, **PARAR e reportar** o erro exato; não improvisar quebrando o setup.
- Ações manuais (painel Supabase, Firebase) → **documentar no README**, não tentar executar.
- `tsconfig.json` exclui `supabase/functions` (código Deno) do typecheck do app.

### Dependências-chave instaladas
`@supabase/supabase-js`, `@react-navigation/*`, `react-native-screens`,
`react-native-safe-area-context`, `react-native-url-polyfill`,
`@react-native-async-storage/async-storage`, `expo-location`, `expo-camera`,
`expo-notifications`, `expo-haptics`, `expo-secure-store`, `expo-crypto`,
`expo-dev-client`, `expo-constants`, `react-native-svg`, `aes-js`, `base64-arraybuffer`.

---

## 9. Próximos passos (Prompt #5+) — priorizados pela auditoria

1. **SMS fallback (CRÍTICO)** — hoje, se o contato não tem o app, recebe NADA. Num
   produto BR de massa isso inviabiliza o alerta. Precisa provedor (Zenvia/Twilio/AWS SNS)
   + Edge Function. Config `sms_fallback` já existe.
2. **Tela de incidente para o CONTATO** — em vez de só abrir o Maps no tap, uma tela com
   mapa + foto + ações ("estou a caminho", "liguei 190"). Requer dar leitura do evento ao
   contato (RLS por telefone) OU manter via payload assinado.
3. **Localização em tempo real de verdade** — hoje é 1 fix único no acionamento. O claim
   "tempo real" exige background location updates + atualização contínua (permissão
   sensível na Play Store).
4. **Recovery** — guia de bloqueio emergencial dos bancos (`bancos_usuario`), o
   diferencial BR ainda não implementado.
5. Configuração do **gesto** de pânico (`configuracao_panico.gesture_tipo`); histórico de
   eventos; billing (campos `plano`/`trial` existem, sem cobrança).

---

## 10. Parecer de viabilidade (auditoria 2026-06-17)

**Veredito: o conceito é viável e o problema é real e doloroso no Brasil. A fundação
técnica é sólida (auth, RLS, captura de pânico, push FCM validado em device). MAS ainda
é um MVP-esqueleto, não um produto de segurança usável** — faltam pilares que são a
própria proposta de valor.

**O que funciona:** onboarding + LGPD, círculo de confiança (CRUD), captura de pânico
(gesto 3s → localização → foto → evento), push FCM entregue e — após esta auditoria —
**alerta acionável** (mapa + foto no push; tap abre o mapa).

**Lacunas que impedem chamar de "produto" (ver seção 9):** sem **SMS fallback** o alerta
só chega a contatos que instalaram o app; **"tempo real"** é só um ponto único; **bloqueio
bancário** (diferencial BR) não existe; sem billing.

**Riscos:** app de segurança que falha é passivo de imagem/legal; entrega de push não é
100% garantida; permissão de localização em background passa por review rígido na Play
Store; mercado tem concorrentes (Life360, bSafe, apps de PM/estaduais).

**Recomendação:** vale continuar, mas o próximo marco deve ser **transformar o alerta em
algo que salva** — SMS fallback + tela de incidente para o contato — antes de gesto/UI/
billing. Sem isso o "uau" do teste E2E não se traduz em valor real para quem recebe.

### Pendência manual adicional (Supabase Dashboard)
- [ ] **Leaked Password Protection** (Auth → Policies) está desligado — ligar
      (checa HaveIBeenPwned). Advisor de segurança aponta como WARN.
