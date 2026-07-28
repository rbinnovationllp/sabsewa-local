# Build with Gemini XPRIZE Devpost Checklist

Target live web URL: `https://www.sabsewa.in`

Official support contact: `support@sabsewa.in`, `+91 8450092846`, `+91 8178113449`

Target category: `Small Business Services`

Current status: Hostinger static web export is prepared in `mobile/dist` after running `npm run export:web:hostinger`.

## Before Upload

- Confirm `mobile/.env` uses production-safe browser variables only.
- Confirm `EXPO_PUBLIC_BACKEND_URL` points to the production API, for example `https://api.sabsewa.in`.
- Confirm server-only secrets remain outside Git:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `AWS_SECRET_ACCESS_KEY`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
- Run:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npm.cmd run export:web:hostinger
```

## Hostinger Upload

- Upload everything inside `C:\Users\HP\SabSewa-Local\mobile\dist` into Hostinger `public_html`.
- Confirm `.htaccess` is included.
- Visit:
  - `https://www.sabsewa.in`
  - `https://www.sabsewa.in/customer`
  - `https://www.sabsewa.in/vendor`
  - `https://www.sabsewa.in/company`

## Backend And Supabase

- Confirm PM2/AWS backend is reachable from the web app.
- Confirm Express CORS allows `https://www.sabsewa.in`.
- Confirm the live Supabase project includes `gemini_agent_logs`.
- Run any pending SabSewa Local migrations in the `sabsewa-local` Supabase project, not the old combined SabSewa project.

## Live Gemini Evidence

Generate at least these live records from the deployed app:

- One vendor inventory capture using a shelf photo, invoice or handwritten list.
- One customer multilingual order using English, Hindi, Hinglish or another supported Indian language.
- One Gemini-assisted customer/vendor message for shortage, rejection or partial fulfilment where practical.

Then capture:

- Supabase `gemini_agent_logs` rows.
- Gemini API usage dashboard screenshot.
- App screenshots showing the AI output and human review.

## Demo Video Under Three Minutes

Suggested structure:

- `0:00-0:45`: Problem and SabSewa Local concept.
- `0:45-1:45`: Live Gemini inventory capture and multilingual order creation.
- `1:45-2:30`: Supabase proof showing `gemini_agent_logs`.
- `2:30-3:00`: Local vendor onboarding proof or testimonials.

## GitHub Submission

- Public repository: include clean README, setup instructions and live URL.
- Private repository: invite the official Devpost judging account shown in the Devpost dashboard.
- Disclose reused earlier SabSewa prototype code honestly.
- Do not commit `.env`, service-role keys, API keys or production credentials.
