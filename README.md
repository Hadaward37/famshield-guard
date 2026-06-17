# FamShield Guard

App Android de **defesa financeira pessoal** contra sequestro relâmpago e roubo de
celular, focado no cenário brasileiro (coerção + Pix). Um gesto de pânico silencioso
notifica o círculo de confiança, compartilha localização em tempo real, captura uma foto
e (em breve) guia o bloqueio emergencial dos bancos.

Stack: **Expo SDK 56** (managed + dev client) · React Native 0.85 · React 19.2 ·
TypeScript · **Supabase** (auth, Postgres + RLS, Storage, Edge Functions).

> 📌 **Contexto completo do projeto:** [`CLAUDE_CONTEXT.md`](./CLAUDE_CONTEXT.md) —
> documento vivo com produto, stack, schema, decisões, progresso por prompt e pendências.
> **Comece por ele** (e mantenha atualizado a cada prompt).

---

## Setup de desenvolvimento

> ⚠️ **A partir do Prompt #3 (fluxo de pânico), o Expo Go NÃO é mais suficiente.**
> O app usa notificações push (FCM), câmera e localização que exigem um
> **development build** com `expo-dev-client`.

### Pré-requisitos
- Node.js ≥ 18, npm, Git, EAS CLI (`npm i -g eas-cli`) — opcional para build na nuvem.
- Conta Expo (EAS) para gerar o `projectId` de push (`eas init`).

### Passo a passo

1. **Variáveis de ambiente** — copie `.env.example` para `.env` e preencha com a URL e a
   anon key do Supabase.

2. **Firebase (push no Android)** — necessário para o Expo Push entregar via FCM:
   1. Firebase Console → criar projeto.
   2. Adicionar app **Android** com package **`com.famshield.guard`**.
   3. Baixar **`google-services.json`** para a **raiz do projeto** (gitignored). Nos
      builds EAS ele é provido pelo **file secret `GOOGLE_SERVICES_JSON`**
      (`app.json` → `android.googleServicesFile: "$GOOGLE_SERVICES_JSON"`),
      **já criado no projeto** via `eas secret:create` — não precisa recriar.
   4. No painel do **Expo** (EAS) → Credentials → enviar a *FCM V1 service account key*
      do Firebase para o projeto, para o Expo Push poder enviar via FCM.

   > O arquivo `google-services.json` **está no `.gitignore`** (contém credenciais).
   > O código trata a ausência dele graciosamente — o registro de push apenas não
   > funciona até o build nativo tê-lo (via file secret).

3. **EAS projectId (push token)** — rode `eas init` para vincular o projeto e gravar
   `extra.eas.projectId` no `app.json`. Sem isso, `getExpoPushTokenAsync` não consegue
   gerar token (o código loga um aviso e segue sem quebrar).

4. **Development build (Android):**
   ```bash
   eas build --profile development --platform android
   ```
   Instale o APK gerado no dispositivo/emulador. Depois, no dia a dia:
   ```bash
   npx expo start --dev-client
   ```

### Testando push real
Use **dois dispositivos/contas**: um como **"idoso"** (aciona o pânico) e outro como
**"familiar"** (contato do círculo, recebe o alerta). O match é feito por telefone:
o `profiles.telefone` do familiar precisa bater com o `telefone` cadastrado no círculo
de confiança do idoso.

---

## Firebase Setup (obrigatório para push Android)

O Expo Push entrega no Android **através do FCM**. Sem esta configuração, todo o fluxo
de pânico funciona, **exceto a entrega da notificação** no aparelho do familiar. Execute
manualmente (uma única vez):

1. Acessar **https://console.firebase.google.com** → criar projeto **`famshield-guard`**.
2. Adicionar **app Android** com package **`com.famshield.guard`**.
3. Baixar **`google-services.json`** → salvar na **raiz do projeto** (gitignored — não comitar).
   - **Os builds EAS não leem o arquivo do disco.** O `app.json` aponta
     `android.googleServicesFile` para **`$GOOGLE_SERVICES_JSON`**, um **EAS file secret**
     **já criado** no projeto (`eas secret:create --type file`). Não precisa recriar; para
     atualizar use `eas secret:create ... --force`. Conferir com `eas secret:list`.
   - O arquivo local serve apenas para builds locais / `prebuild`.
4. No console Firebase: **Project Settings → Cloud Messaging** → gerar a **FCM V1 Server Key**
   (service account key).
5. Acessar **https://expo.dev** → seu projeto → **Credentials** → adicionar a **FCM V1 key**.
6. Rodar **`eas init`** na pasta do projeto para gerar **`extra.eas.projectId`** no `app.json`
   (necessário para o `getExpoPushTokenAsync` gerar o token de push).

---

## Gerando o Development Build

A partir do **Prompt #3** o app usa `expo-dev-client` (push, câmera, localização nativas),
então **o Expo Go não funciona mais** — é preciso um **development build** (APK próprio com
os módulos nativos embutidos), que substitui o Expo Go no dia a dia.

```powershell
# Instalar EAS CLI se não tiver
npm install -g eas-cli

# Login (primeira vez)
eas login

# Gerar build de desenvolvimento (Android APK)
eas build --platform android --profile development
```

> 🔐 **google-services.json via file secret:** o build resolve
> `android.googleServicesFile = "$GOOGLE_SERVICES_JSON"` a partir do **EAS file secret
> `GOOGLE_SERVICES_JSON`**, que **já existe no projeto** (criado com `eas secret:create`).
> Não é preciso recriar nem comitar o arquivo. (`eas secret:list` para conferir.)

Ao terminar, o **APK** fica disponível para download no **painel EAS**:
**https://expo.dev → seu projeto → Builds** (cada build tem um botão *Download* / QR code).
Instale o APK no dispositivo/emulador. Depois, no dia a dia, rode:

```powershell
npx expo start --dev-client
```

---

## Roteiro de Teste E2E — Fluxo de Pânico

### Pré-requisitos
- **2 dispositivos Android** com o development build instalado
  (ou 1 device + 1 emulador com Google Play).
- **2 contas** criadas no app: **Conta A = idoso**, **Conta B = familiar**.
- Conta A com **Conta B cadastrada no círculo de confiança** (telefone da B = telefone
  do perfil da B).

### Sequência de teste

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Conta A: abrir app, ir para Home | `PanicButton` visível |
| 2 | Conta A: segurar botão por 3s | Haptics + anel de progresso |
| 3 | App solicitar permissões (1ª vez) | Conceder localização + câmera |
| 4 | Câmera frontal abrir | Preview visível |
| 5 | Captura (botão Foto) | Foto tirada, upload iniciado |
| 6 | Estado `DONE` aparecer | Mensagem de confirmação |
| 7 | Conta B: receber push | Notificação com nome + horário |
| 8 | Supabase: verificar `eventos_panico` | Linha inserida com lat/lng + `foto_url` |
| 9 | Supabase: verificar `panic-photos` | Arquivo `{user_id}/{evento_id}.jpg` existe |

### Critérios de falha a registrar
- **Timeout de localização (>10s)** → registrar dispositivo e condição de rede.
- **Push não chegou na Conta B** → verificar `push_tokens` no Supabase e a FCM key no EAS.
- **Upload falhou** → verificar as policies do bucket e o tamanho da imagem.

### Cobertura por dependência
- **Funciona SEM Firebase:** passos **1–6** + passos **8–9**.
- **Requer Firebase:** passo **7** (entrega do push).

---

## Banco de dados (Supabase)

Tabelas principais: `profiles`, `circulo_confianca`, `bancos_usuario`,
`configuracao_panico`, `incidentes`, `notificacoes_incidente`, **`eventos_panico`**,
**`push_tokens`**. Todas com **RLS** por `auth.uid()`.

Storage: bucket privado **`panic-photos`** (limite 5 MB, `image/jpeg`/`image/png`).
Path de upload: `{user_id}/{evento_id}.jpg`.

### Edge Function `notificar-circulo`
Recebe `{ evento_id }`, valida o dono do evento, casa contatos do círculo com
`profiles.telefone` (normalizando os números), busca os `push_tokens` (via service role)
e dispara as notificações pela Expo Push API. Deploy:

```bash
supabase functions deploy notificar-circulo
```

Variáveis de ambiente necessárias na função (já disponíveis por padrão no runtime do
Supabase): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

O alerta é **acionável**: a notificação push embute o **link de localização** (mapa) e
uma **URL assinada da foto** (24h). Tocar no alerta abre o mapa.

### SMS de emergência (fallback) — pendente de credenciais
Contatos do círculo que **não têm o app instalado** (e com `notificar_sms = true`) recebem
um **SMS** com o nome e o link de localização — desde que o usuário tenha consentido
(`configuracao_panico.sms_fallback`). A Edge Function já implementa isso via **Twilio**;
só falta plugar as credenciais (sem elas, o SMS é pulado sem quebrar o push):

```bash
# crie uma conta Twilio (tem trial), compre/!use um número e configure os secrets:
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxx
supabase secrets set TWILIO_FROM=+15555555555
```

> Trocar de provedor (ex.: Zenvia/AWS SNS) = só reimplementar a função `enviarSMS` na
> Edge Function. O número `TWILIO_FROM` deve estar em formato **E.164**. Os telefones do
> círculo são enviados como `+55` + nacional.

---

## Setup manual — concluído ✅

- [x] Projeto Firebase + app Android `com.famshield.guard`; `google-services.json` na raiz (gitignored).
- [x] **`google-services.json` provido aos builds via EAS file secret `GOOGLE_SERVICES_JSON`**
      (`app.json` → `android.googleServicesFile: "$GOOGLE_SERVICES_JSON"`). Já criado — não recriar.
- [x] FCM V1 key enviada ao EAS (Credentials).
- [x] `eas init` → `extra.eas.projectId` no `app.json`.
- [x] Edge Function `notificar-circulo` deployada (via Supabase MCP).
- [x] "Confirm email" desabilitado no painel Supabase.

---

## Scripts

```bash
npm start            # expo start
npx expo start --dev-client   # com development build instalado
npx tsc --noEmit     # checagem de tipos
```
