# SabSewa Local Hostinger Web Deployment

SabSewa Local can be exported as a static Expo Web single-page application for Hostinger shared hosting at `https://www.sabsewa.in`.

## Security Rules

Only `EXPO_PUBLIC_*` values are allowed in the browser bundle.

Safe browser values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_RAZORPAY_KEY_ID`, if the web checkout uses it directly

Never expose these in mobile/web client files:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AWS_SECRET_ACCESS_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Server-only secrets must remain in `mobile/server/.env` or the production API server environment.

## Production Environment

Before export, set the public backend URL to the production API endpoint, for example:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_PUBLIC_BACKEND_URL="https://api.sabsewa.in"
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npm.cmd run export:web:hostinger
```

For local development only, you may temporarily override the backend URL:

```text
EXPO_PUBLIC_BACKEND_URL=http://localhost:5001
```

Do not use `localhost` in the production Hostinger export.

## Build

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_PUBLIC_BACKEND_URL="https://api.sabsewa.in"
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npm.cmd run export:web:hostinger
```

The static output is created in:

```text
C:\Users\HP\SabSewa-Local\mobile\dist
```

## Hostinger Upload

Upload the contents of `mobile/dist` directly into Hostinger `public_html`.

Make sure `.htaccess` is included. It is required so routes such as `/vendor`, `/customer`, and `/company` load `index.html` instead of returning a Hostinger 404.

The Hostinger export script also creates:

- `manifest.webmanifest`
- `service-worker.js`
- `offline.html`
- `pwa-icons/icon-192.png`
- `pwa-icons/icon-512.png`

Upload these files and folders with the rest of `dist` so the web application can be installed as a PWA on supported browsers.

## Local Static Test

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npx.cmd serve dist -s -l 3000
```

Test:

- `http://localhost:3000`
- `http://localhost:3000/customer`
- `http://localhost:3000/vendor`
- `http://localhost:3000/company`

## Secret Leak Audit

After export, search the `dist` bundle before upload:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
Select-String -Path .\dist\_expo\static\js\web\*.js -Pattern "SUPABASE_SERVICE_ROLE_KEY","GEMINI_API_KEY","AWS_SECRET_ACCESS_KEY","RAZORPAY_KEY_SECRET","RAZORPAY_WEBHOOK_SECRET"
```

Expected result: no matches.

Public Supabase URL and anon key may appear in the bundle. That is normal, provided RLS is enabled and service-role keys are never exposed.
