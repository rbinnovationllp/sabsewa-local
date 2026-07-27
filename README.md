# SabSewa Local

Mobile-first HyperLocal Marketplace built for the Build with Gemini XPRIZE Hackathon.

## Hackathon Positioning

SabSewa Local is not just a normal local-commerce app. The core AI business workflows are powered by Gemini / Google Cloud:

1. Vendor inventory capture from shelf, invoice, or handwritten-list photos.
2. Customer conversational ordering in English, Hindi, and local Indian languages.
3. Smart rejection/support messages when a vendor cannot fulfill an order.

Codex is used only for scaffolding, UI, database boilerplate, and non-AI implementation speed.

## Folder Structure

```text
SabSewa-Local/
  backend/       Gemini API endpoints and server logic
  mobile/        Expo React Native mobile app scaffold
  supabase/      Database schema and RLS migrations
  PRD/           Product and hackathon compliance docs
  docs/          Demo, onboarding, and operating checklists
```

## Build Order

1. Apply Supabase schema from `supabase/migrations/001_hlm_core_schema.sql`.
2. Configure backend `.env` from `backend/.env.example`.
3. Run backend locally.
4. Configure mobile `.env` from `mobile/.env.example`.
5. Run Expo mobile app.
6. Record demo showing live Gemini calls and audit logs.

## Demo Must Show

- Vendor photo -> Gemini -> draft inventory JSON.
- Customer text/voice order -> Gemini -> cart JSON.
- Vendor rejection -> Gemini -> friendly customer message and audit log.

