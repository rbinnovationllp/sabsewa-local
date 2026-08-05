# SabSewa Local Anti-Cloning Security Checklist

This checklist reduces the risk and impact of unauthorized cloning. No source-code protection is absolute if someone has repository access, so protection must combine private access, backend-controlled business logic, infrastructure ownership, and legal controls.

## Manual Owner Actions

- Keep the GitHub/Git repository private.
- Require 2FA for every collaborator.
- Enable branch protection on `main`.
- Require pull requests before merge.
- Disable force-push on protected branches.
- Audit collaborators monthly.
- Remove departing contributors immediately.
- Rotate any secret that may have been shared or exposed.
- Store production secrets only in approved secret stores.
- Register copyright and trademark where appropriate.
- Use NDAs, IP assignment, and contractor agreements.
- Release only signed APK/AAB builds.
- Configure Firebase Cloud Messaging for low-cost push notifications.
- Use SMS only for OTP or genuinely critical fallback events.

## Repository Controls Implemented

- `.gitignore` excludes `.env`, `.env.*`, APK/AAB files, keystores, signing files, and dependency folders.
- Proprietary license added at `LICENSE`.
- Security policy added at `SECURITY.md`.
- Backend startup logging avoids printing secret values or sensitive configuration.
- Reusable API security middleware is available under `mobile/server/security/apiSecurity.js`.

## Backend Architecture Rules

Keep these server-side:

- Vendor settlement.
- QR/payment validation and repayment confirmation.
- Credit ledger and balance changes.
- Storage quota/purchase enforcement.
- Subscription/activation checks.
- Commission and wallet calculations.
- Delivery status verification.

The app should call APIs. It should not contain critical business rules that make a copied frontend commercially useful.

## API Hardening To Roll Out Route By Route

Use the backend security middleware for sensitive routes:

- `requireUserJwt` for authenticated user APIs.
- `requireDeviceHeaders` for routes that should only accept known app clients.
- `createRateLimiter` for public or abuse-prone endpoints.
- `requireRole` after JWT verification where user role is known.
- `validateRequiredBody` for request validation.

Do not switch every route at once during pilot testing. Start with admin, vendor payment, settlement, storage upload, wallet, and credit mutation routes.

## Infrastructure Controls

A copied frontend should not work without:

- Your AWS backend.
- Your Supabase database and RLS policies.
- Your Firebase project.
- Your Razorpay account.
- Your MSG91/Auth provider setup.
- Your domain and deployment pipeline.

## Monitoring

Periodically search for:

- `SabSewa Local`
- `sabsewa-local`
- `Rashi Bhartiya Innovation LLP`
- unique route names and database table names
- package IDs and app display names

Record suspected copies with timestamped evidence before sending takedown or legal notices.
