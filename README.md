# SabSewa Local

SabSewa Local is a mobile-first hyperlocal marketplace connecting customers with verified nearby shops, including kirana stores, vegetable and fruit sellers, medical stores, dairy shops, bakeries, restaurants and tiffin providers.

The platform supports local product discovery, multilingual ordering, vendor catalogues, delivery tracking, vendor advance wallets, fixed Rs 15 platform facilitation fees linked to confirmed vendor order acceptance, and vendor-managed customer credit records.

SabSewa Local is an independent project. It does not include SabSewa Pro, SabSewa Job or SabSewa SHG.

## Hackathon Positioning

SabSewa Local is being prepared for participation in a Gemini-focused hackathon. Its principal AI workflows use Gemini and suitable Google Cloud services:

1. Vendor inventory creation from shelf, invoice or handwritten-list photographs.
2. Customer conversational ordering in English, Hindi and other Indian languages.
3. Intelligent product discovery and order assistance.
4. Helpful customer messages when a vendor cannot fully or partially fulfil an order.
5. Structured AI outputs with appropriate validation and audit records.

Codex is used for project scaffolding, user-interface development, database structure, security policies, documentation and other non-AI implementation work.

## Core Features

- Nearby vendor discovery within approximately 500 metres to 1 kilometre
- Customer, vendor and rider mobile workflows
- Responsive web access and CRM dashboards
- Company Master CRM
- Individual Vendor CRM
- Daily product availability and vendor-controlled pricing
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
- Razorpay integration for vendor wallet top-ups
- Gemini-powered product and ordering assistance

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

## Demonstration Requirements

The demonstration should include:

- Vendor photograph or handwritten list -> Gemini analysis -> draft inventory
- Customer text or voice request -> Gemini interpretation -> structured cart
- Nearby-vendor discovery and product display
- Full or partial order acceptance
- Rs 15 vendor-wallet deduction linked to genuine vendor order acceptance
- Customer details revealed only after confirmed acceptance
- Vendor rejection or shortage -> Gemini-assisted customer message
- Relevant security and audit records

## Project Status

See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for completed features, pending work, known issues, test results and production-readiness status.

## Copyright and Licence

Copyright 2026 Rashi Bhartiya Innovation LLP. All rights reserved.

This repository and its source code are proprietary and confidential. No part of this project may be copied, modified, distributed, published, sublicensed or used for commercial or non-commercial purposes without prior written permission from Rashi Bhartiya Innovation LLP.
