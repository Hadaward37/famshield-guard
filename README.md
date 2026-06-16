# FamShield Guard

App Android de **defesa financeira pessoal** contra sequestro relâmpago e roubo de
celular, focado no cenário brasileiro (coerção + Pix). Um gesto de pânico silencioso
notifica o círculo de confiança, compartilha localização em tempo real, captura uma foto
e (em breve) guia o bloqueio emergencial dos bancos.

Stack: **Expo SDK 56** (managed + dev client) · React Native 0.85 · React 19.2 ·
TypeScript · **Supabase** (auth, Postgres + RLS, Storage, Edge Functions).

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
   3. Baixar **`google-services.json`** e colocar em **`android/app/`**
      (após o primeiro `prebuild`/build) **ou** na raiz do projeto, conforme apontado em
      `app.json` (`android.googleServicesFile`).
   4. No painel do **Expo** (EAS) → Credentials → enviar a *FCM V1 service account key*
      do Firebase para o projeto, para o Expo Push poder enviar via FCM.

   > O arquivo `google-services.json` **está no `.gitignore`** (contém credenciais).
   > O código trata a ausência dele graciosamente — o registro de push apenas não
   > funciona até o build nativo tê-lo.

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

---

## Pendências manuais (fora do alcance do CLI/MCP)

- [ ] Criar projeto Firebase + app Android `com.famshield.guard` e baixar
      `google-services.json` para `android/app/`.
- [ ] Enviar a FCM V1 key ao EAS (Credentials) para o Expo Push entregar no Android.
- [ ] Rodar `eas init` para gerar o `projectId` (push token).
- [ ] `supabase functions deploy notificar-circulo` (se não houver deploy via MCP).
- [x] Desabilitar "Confirm email" no painel Supabase (feito no Prompt #2).

---

## Scripts

```bash
npm start            # expo start
npx expo start --dev-client   # com development build instalado
npx tsc --noEmit     # checagem de tipos
```
