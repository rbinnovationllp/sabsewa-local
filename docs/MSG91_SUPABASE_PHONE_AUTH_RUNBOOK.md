# SabSewa Local MSG91 Phone OTP Runbook

SabSewa Local must keep Supabase as the identity, OTP and session authority. MSG91 is only the SMS delivery channel through the Supabase Send SMS Hook.

## Architecture

- Frontend sends OTP with `supabase.auth.signInWithOtp({ phone: "+91XXXXXXXXXX" })`.
- Supabase generates the OTP and calls the Send SMS Hook.
- The Edge Function `supabase/functions/send-sms-msg91/index.ts` sends the Supabase-generated OTP through MSG91.
- Frontend verifies with `supabase.auth.verifyOtp({ phone, token, type: "sms" })`.

## Required dashboard setup

1. In MSG91, activate transactional OTP messaging for India.
2. Complete DLT entity, sender/header and template approval.
3. Create an OTP template that matches the final legal message and is approved in MSG91/DLT before production use.
4. In Supabase, confirm the project plan supports Auth Hooks and configure the Send SMS Hook HTTP endpoint for the deployed Edge Function.
5. Store these secrets only in Supabase Edge Function secrets:
   - `MSG91_AUTH_KEY`
   - `MSG91_OTP_TEMPLATE_ID`
   - `MSG91_SENDER_ID`
   - `SUPABASE_SEND_SMS_HOOK_SECRET`

Do not place these values in `EXPO_PUBLIC_*`, GitHub, Hostinger `dist`, screenshots, logs or chat messages.

## Local testing

Keep `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true` only in `mobile/.env` for local testing. Do not export/upload Hostinger production with this flag enabled until the real OTP acceptance test passes.

Use:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npm.cmd run web -- --port 8081 --clear
```

Open:

```text
http://localhost:8081/auth/Register?role=customer
```

If a blank page appears, clear browser site data for `localhost:8081`, unregister localhost service workers, then reopen the URL. The app now avoids registering the production service worker on localhost.

## Acceptance test

Do not mark Mobile OTP production-ready until all of these pass with a real Indian mobile number:

- OTP request reaches Supabase Auth.
- Supabase calls the MSG91 Send SMS Hook.
- MSG91 sends the OTP to the handset.
- Correct OTP verifies successfully through Supabase.
- Incorrect OTP is rejected.
- Resend cooldown works.
- Supabase session is created.
- Customer/vendor profile, address and Terms acceptance are saved.
- Session persists after closing and reopening the PWA.
- Production Hostinger build contains no MSG91 secret.

## Rollback

Keep Twilio configuration available only as rollback until MSG91 passes the full acceptance test. Remove Twilio references only after the verified MSG91 path is live and stable.
