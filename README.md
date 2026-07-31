![SabSewa Local](mobile/assets/images/sabsewa-local-readme-banner.png)

# SabSewa Local

SabSewa Local is a mobile-first hyperlocal marketplace connecting customers with verified nearby shops, including kirana stores, vegetable and fruit sellers, medical stores, dairy shops, bakeries, restaurants and tiffin providers.

The platform supports local product discovery, multilingual ordering, vendor catalogues, delivery tracking, vendor advance wallets, fixed Rs 15 platform facilitation fees linked to confirmed vendor order acceptance, and vendor-managed customer credit records.

SabSewa Local is an independent project. It does not include SabSewa Pro, SabSewa Job or SabSewa SHG.

## Build with Gemini XPRIZE

Hackathon category: **Small Business Services**

Live web app target: [https://www.sabsewa.in](https://www.sabsewa.in)

Support: `support@sabsewa.in` | `+91 8450092846` | `+91 8178113449`

SabSewa Local uses Gemini as the AI operating layer for small local vendors:

1. **Multimodal vendor inventory capture:** Gemini reads shelf photos, invoices and handwritten product lists, then returns structured catalogue drafts for vendor review.
2. **Multilingual customer ordering:** Gemini parses English, Hindi, Hinglish and local-language order requests into structured carts.
3. **Gemini Flash dynamic translation:** Dynamic vendor/customer text is translated only through the secure backend with privacy redaction, cache reuse and cost telemetry.
4. **Human-in-the-loop audit logging:** Gemini outputs are validated by the app workflow and logged in Supabase `gemini_agent_logs` for transparency and submission evidence.

## Hackathon Positioning

SabSewa Local is being prepared for participation in a Gemini-focused hackathon. Its principal AI workflows use Gemini and suitable Google Cloud services:

1. Vendor inventory creation from shelf, invoice or handwritten-list photographs.
2. Customer conversational ordering in English, Hindi and other Indian languages.
3. Intelligent product discovery and order assistance.
4. Helpful customer messages when a vendor cannot fully or partially fulfil an order.
5. Structured AI outputs with appropriate validation and audit records.

Codex is used for project scaffolding, user-interface development, database structure, security policies, documentation and other non-AI implementation work.

AWS S3 is used only for secure file and image storage. This is acceptable under the supplied hackathon guidance because SabSewa Local still uses Gemini / Google Cloud for its required AI-operated business workflows.

See [`docs/HACKATHON_ALIGNMENT.md`](docs/HACKATHON_ALIGNMENT.md) and [`docs/DEADLINE_GAP_AND_READINESS_REPORT_2026-07-31.md`](docs/DEADLINE_GAP_AND_READINESS_REPORT_2026-07-31.md) for the detailed eligibility checklist, deadline gap report, evidence requirements, reused-code disclosure risk and demo acceptance criteria.

Use [`docs/DEVPOST_SUBMISSION_CHECKLIST.md`](docs/DEVPOST_SUBMISSION_CHECKLIST.md) for the final upload, live Gemini evidence, demo video and Devpost steps.

For final AI handover, use [`docs/GEMINI_HANDOVER_PROMPT.md`](docs/GEMINI_HANDOVER_PROMPT.md).

For the first controlled housing-society pilot, use [`docs/SOCIETY_PILOT_LAUNCH_RUNBOOK.md`](docs/SOCIETY_PILOT_LAUNCH_RUNBOOK.md), [`docs/PILOT_FEEDBACK_FORM.md`](docs/PILOT_FEEDBACK_FORM.md), [`docs/PILOT_DAILY_MONITORING_REPORT.md`](docs/PILOT_DAILY_MONITORING_REPORT.md) and [`docs/PILOT_REVENUE_AND_ORDER_LOG_TEMPLATE.csv`](docs/PILOT_REVENUE_AND_ORDER_LOG_TEMPLATE.csv).

For Razorpay live-payment readiness, use [`docs/RAZORPAY_LIVE_MODE_READINESS.md`](docs/RAZORPAY_LIVE_MODE_READINESS.md). Razorpay Test Mode transactions are simulations and must not activate real vendor wallets or commercial order receiving.

## Core Features

- Nearby vendor discovery within approximately 500 metres to 1 kilometre
- Customer, vendor and rider mobile workflows
- Responsive web access and CRM dashboards
- Company Master CRM
- Individual Vendor CRM
- Daily product availability and vendor-controlled pricing
- Vendor catalogue setup after registration with searchable multi-select master catalogue and pending-review flow for missing products
- Vendor-contributed reusable product-image catalogue
- Full or partial order acceptance
- Customer information hidden until order acceptance
- Fixed Rs 15 platform facilitation fee for each confirmed vendor order acceptance
- Vendor advance-wallet management
- Vendor-controlled customer credit records
- Delivery assignment and tracking
- Multilingual interface for Indian languages
- Supabase authentication, database and Row-Level Security
- Secure image and document storage
- Razorpay integration for Rs 5,500 first vendor activation and Rs 5,000 later wallet top-ups
- Gemini-powered product and ordering assistance

## Razorpay Payment Safety

Vendor payments are separated by Razorpay environment. In Test Mode, no real money is collected, no production wallet balance is credited and no vendor is activated for commercial orders.

In Live Mode, vendor wallet credits are applied only after the backend receives and verifies a Razorpay `payment.captured` webhook. Client-side payment callbacks are used only to inform the user that the payment response was received.

## Multilingual Support

English is the default offline fallback. English, Hindi and Kannada are enabled as the Bengaluru launch-language foundation for core onboarding, registration, discovery and delivery-safety flows. Other Eighth Schedule Indian languages are listed as phased languages and shown as `Coming Soon` until reviewed translations or validated downloadable language packs are available.

Dynamic marketplace text such as customer notes, vendor responses, product descriptions and support messages is routed to Gemini Flash through the backend only. Gemini API keys are never included in the mobile app, Android build or browser bundle.

## Project Structure

```text
SabSewa-Local/
|-- backend/      Root backend service, if used
|-- mobile/       Expo React Native mobile application
|-- mobile/server Active SabSewa Local mobile backend/server
|-- supabase/     Database schema, migrations and RLS policies
|-- PRD/          Product requirements and specifications
|-- docs/         Demonstration, onboarding and operating documents
|-- README.md
`-- PROJECT_STATUS.md
```

## Development Setup

1. Review `PROJECT_STATUS.md` for the latest implementation status.
2. Apply the Supabase migrations from `supabase/migrations/`, or use the bundled SQL files in `supabase/`.
3. Configure the backend/server environment:
   - Use `backend/.env.example` if running the root backend service.
   - Use `mobile/server/.env.example` for the active SabSewa Local mobile backend.
4. Start and test the backend/server locally.
5. Configure the mobile environment using `mobile/.env.example`.
6. Install mobile dependencies and start the Expo application.
7. Test customer, vendor, rider, wallet, credit and delivery workflows.
8. Verify RLS policies using separate test accounts for every role.
9. Validate live Gemini calls and structured outputs.
10. Prepare the production build and hackathon demonstration.

Never commit actual API keys, passwords, service-role keys or production credentials to GitHub.

## Local Setup

```powershell
git clone https://github.com/your-username/sabsewa-local.git
cd sabsewa-local\mobile
npm install
Copy-Item .env.example .env
npm.cmd run web
```

For mobile testing:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npx.cmd expo start -c --offline
```

For Hostinger web export:

```powershell
cd C:\Users\HP\SabSewa-Local\mobile
$env:EXPO_NO_DEPENDENCY_VALIDATION="1"
npm.cmd run export:web:hostinger
```

Upload the contents of `mobile/dist` to Hostinger `public_html`. See [`docs/HOSTINGER_WEB_DEPLOYMENT.md`](docs/HOSTINGER_WEB_DEPLOYMENT.md).

## Security Notes

Only browser-safe variables may use the `EXPO_PUBLIC_` prefix:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_RAZORPAY_KEY_ID`, if used directly by the browser checkout

Never expose these in the mobile or web bundle:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `AWS_SECRET_ACCESS_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

## Demonstration Requirements

The demonstration should include:

- Vendor photograph or handwritten list -> Gemini analysis -> draft inventory
- Customer text or voice request -> Gemini interpretation -> structured cart
- Nearby-vendor discovery and product display
- Full or partial order acceptance
- Rs 15 vendor-wallet deduction linked to genuine vendor order acceptance
- First vendor activation payment split into Rs 500 non-refundable activation/service charge and Rs 5,000 refundable advance wallet credit
- Customer details revealed only after confirmed acceptance
- Vendor rejection or shortage -> Gemini-assisted customer message
- Relevant security and audit records
- Gemini API usage evidence and redacted Gemini audit logs
- Clear disclosure of any older SabSewa prototype code reused in this independent SabSewa Local project

## Project Status

See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for completed features, pending work, known issues, test results and production-readiness status.

## Copyright and Licence

Copyright 2026 Rashi Bhartiya Innovation LLP. All rights reserved.

This repository and its source code are proprietary and confidential. No part of this project may be copied, modified, distributed, published, sublicensed or used for commercial or non-commercial purposes without prior written permission from Rashi Bhartiya Innovation LLP.
