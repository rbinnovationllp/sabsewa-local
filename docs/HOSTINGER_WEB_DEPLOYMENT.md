# SabSewa Local Hostinger PWA Deployment

SabSewa Local can be exported as a static Expo Web single-page application for Hostinger shared hosting at `https://www.sabsewa.in`.

Hostinger `public_html` must contain only static PWA frontend files. Production business data must not be stored in Hostinger files:

- Customer, vendor, order, wallet, payment, credit, support and audit records: Supabase.
- Product images and vendor documents: private AWS S3 bucket, served only through approved URLs.
- Backend business logic, Gemini, Razorpay verification and privileged Supabase access: AWS EC2 at `https://api.sabsewa.in`.
- Frontend static shell only: Hostinger `public_html`.

Replacing the deployed frontend files must not delete Supabase database rows, AWS S3 objects or EC2 backend code. Do not run Supabase migrations, S3 cleanup, backend deployment or storage deletion as part of a routine Hostinger frontend upload.

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

The `export:web:hostinger` script now also:

- Copies version-controlled public assets from `mobile/web-public` into `mobile/dist`.
- Adds PWA files: `.htaccess`, `manifest.webmanifest`, `service-worker.js`, `offline.html`, `robots.txt`, `sitemap.xml`, icons and `deployment-meta.json`.
- Validates that the bundle targets `https://api.sabsewa.in`.
- Validates that the bundle references Supabase project `xodmazgfibftorrlbotk`.
- Blocks builds containing localhost backend URLs, `SabSewa-Alert` references, server folders, Supabase migration folders, `.env` files, private-key files or server-secret markers.
- Archives the last successful static build under `mobile/web-deployments` for rollback.

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

Expected `public_html` contents after upload include:

- `_expo/`
- `assets/`
- `pwa-icons/`
- `.htaccess`
- `favicon.ico`
- `index.html`
- `manifest.webmanifest`
- `metadata.json`
- `offline.html`
- `robots.txt`
- `sitemap.xml`
- `service-worker.js`
- `deployment-meta.json`
- Any domain-verification files placed under `mobile/web-public/domain-verification/`

Do not upload:

- `mobile/server/`
- `supabase/`
- `node_modules/`
- `.env` files
- `.pem`, `.key`, signing-key or credential files
- SQL migration bundles

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

The build runs this automatically:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm.cmd run deploy:validate
```

For an extra manual check, search the `dist` bundle before upload:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
Select-String -Path .\dist\_expo\static\js\web\*.js -Pattern "SUPABASE_SERVICE_ROLE_KEY","GEMINI_API_KEY","AWS_SECRET_ACCESS_KEY","RAZORPAY_KEY_SECRET","RAZORPAY_WEBHOOK_SECRET"
```

Expected result: no matches.

Public Supabase URL and anon key may appear in the bundle. That is normal, provided RLS is enabled and service-role keys are never exposed.

## Rollback

Every successful validated export is copied into:

```text
C:\Users\HP\SabSewa-Local\mobile\web-deployments
```

To restore the previous successful static build locally:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm.cmd run deploy:rollback
```

Then upload the restored `mobile/dist` contents to Hostinger `public_html`.

To restore a specific archived build ID:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm.cmd run deploy:rollback -- 20260731214500
```

Rollback affects only frontend files in `mobile/dist`. It does not change Supabase, AWS S3 or EC2 backend data.
