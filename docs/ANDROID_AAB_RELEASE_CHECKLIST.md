# SabSewa Local Android AAB Release Checklist

Updated: 2026-07-29

## Release Targets

- Android package: `in.sabsewa.local`
- App name: `SabSewa Local`
- Production API: `https://api.sabsewa.in`
- Production web: `https://sabsewa.in` and `https://www.sabsewa.in`
- Shared Supabase project: `https://xodmazgfibftorrlbotk.supabase.co`
- Shared S3 bucket: `sabsewa-local-product-images-624719611353-ap-south-1-an`

Mobile and web are two interfaces to the same backend. Do not create separate Supabase projects, S3 buckets, vendor ledgers, inventories or wallets for Android and web.

## Build Outputs

- APK: internal testing or direct physical-device testing only.
- AAB: Google Play internal, closed, open and production release tracks.

The configured EAS profiles are:

- `internal-apk`: Android APK for testing.
- `production`: Android App Bundle for Google Play.

## Secret Safety

Never put these in commands, source code, GitHub, screenshots or frontend bundles:

- Supabase service-role key
- Razorpay key secret or webhook secret
- AWS access key or secret key
- Gemini API key used by the backend
- Android signing password
- Private key files

Frontend builds may contain only public values such as `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BACKEND_URL` and public Razorpay key ID where required.

## Permission Justification

- Location: used only after consent to find nearby vendors, verify shop location and support delivery tracking.
- Camera/photos: used only when a vendor or authorised user chooses to upload product images, inventory photos or business documents.
- Microphone/voice input: used only when a customer or vendor chooses to speak an order or product information. Do not record audio in the background.

## Manual PowerShell Commands

Run these only inside:

```powershell
C:\Users\HP\SabSewa-Local\mobile
```

Do not run them from `C:\`, your user-profile root or another project.

### Local Development

Purpose: start Expo locally for phone/browser testing.

Expected result: Expo starts a local development server and prints a QR code or local URL.

Secret safety: does not print private backend secrets if `.env` contains only public `EXPO_PUBLIC_*` values.

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm run start
```

### Reproducible Dependency Install

Purpose: install exactly the dependency tree recorded in `package-lock.json`.

Expected result: `node_modules` is recreated according to the lockfile.

Secret safety: does not require or print secrets.

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm ci
```

### Web Production Build

Purpose: produce static web files for Hostinger.

Expected result: `mobile/dist` is generated and `.htaccess` is copied.

Secret safety: only public `EXPO_PUBLIC_*` values are bundled. Server secrets must remain in `mobile/server/.env` or production secret storage.

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm run export:web:hostinger
```

### APK Internal Testing Build

Purpose: create an APK for testing outside Google Play.

Expected result: EAS creates an installable APK artifact.

Secret safety: do not pass signing passwords or secret keys as command arguments. Use EAS credential management or approved secret storage.

Package source: `eas-cli` is the official Expo Application Services CLI. Verified package: `eas-cli@21.3.0`.

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm exec --package eas-cli@21.3.0 -- eas build --platform android --profile internal-apk
```

### AAB Production Build

Purpose: create the signed Android App Bundle required by Google Play.

Expected result: EAS creates a `.aab` artifact suitable for Google Play tracks.

Secret safety: do not expose signing credentials in command arguments or screenshots. Use EAS credentials flow and Google Play App Signing.

Package source: `eas-cli` is the official Expo Application Services CLI. Verified package: `eas-cli@21.3.0`.

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
npm exec --package eas-cli@21.3.0 -- eas build --platform android --profile production
```

## Before AAB Submission

- Confirm Play App Signing is enabled.
- Confirm target API level meets Google Play requirement at submission time.
- Confirm privacy policy URL is live.
- Complete Google Play Data Safety form.
- Provide account deletion/support process.
- Verify no `localhost` or test backend URL is present.
- Verify Razorpay test keys are not used in production release.
- Test on a physical Android phone.
- Test web/mobile shared-backend workflows:
  - Customer registers on mobile and signs in on web.
  - Vendor updates item availability on mobile and sees it on web.
  - Customer creates order on web and vendor receives it on mobile.
  - Product image uploaded from mobile displays on web.
  - Wallet top-up and ledger are consistent.
  - RLS prevents cross-account access.

## Rollback

- Keep the previous working APK/AAB artifact reference.
- Keep the previous Hostinger `dist` backup before uploading a new web build.
- Roll backend changes through PM2/Nginx only after health checks pass.
