# Gemini Handover Prompt

Use this prompt when handing SabSewa Local to Gemini for final hackathon preparation.

## Prompt

You are reviewing and completing SabSewa Local for the Build with Gemini XPRIZE hackathon.

SabSewa Local is an independent hyperlocal marketplace for customers, vendors and riders. It uses Supabase for authentication, PostgreSQL, RLS, realtime data and backend data services; AWS S3 for product images and documents; Razorpay for vendor advance-wallet top-ups; and Gemini / Google Cloud for AI-operated business workflows. AWS S3 is allowed and must remain only the file-storage layer. Do not replace Gemini with another AI provider.

Focus only on SabSewa Local. Do not include SabSewa Pro, SabSewa Job or SabSewa SHG.

## Files To Review First

- `README.md`
- `PROJECT_STATUS.md`
- `docs/HACKATHON_ALIGNMENT.md`
- `PRD/GEMINI_XPRIZE_COMPLIANCE_CHECKLIST.md`
- `docs/DEMO_RUNBOOK.md`
- `docs/LOCAL_VENDOR_TRACTION_LOG.md`
- `mobile/server/gemini/geminiRoutes.js`
- `mobile/server/gemini/auditLog.js`
- `mobile/server/hyperlocal/placeOrder.js`
- `mobile/server/hyperlocal/vendorOrderActions.js`
- `supabase/migrations/202607240002_create_gemini_agent_logs.sql`
- `supabase/RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`

## Exact Tasks

1. Verify that Gemini is used in live workflows, not only as a chatbot:
   - Vendor inventory extraction from image input.
   - Multilingual customer order parsing.
   - Structured cart creation.
   - Product/unit normalisation.
   - Vendor shortage, rejection and partial-fulfilment assistance.
   - Customer-friendly AI-generated messages.
   - Unserved-area demand analysis for vendor recruitment.

2. Confirm Google Cloud / Gemini configuration:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `GEMINI_PROVIDER`
   - `GOOGLE_CLOUD_PROJECT`, if Vertex AI is used
   - `GOOGLE_CLOUD_LOCATION`, if Vertex AI is used

3. Verify security:
   - No service-role key in mobile or web client code.
   - No passwords, complete addresses, full phone numbers or payment credentials in Gemini prompts or logs.
   - Supabase RLS remains active for customer, vendor, rider and admin data isolation.
   - Sensitive order acceptance and Rs 15 deduction logic runs through protected backend transactions.

4. Verify business workflows:
   - Customer sees only vendors open and available within the approved local radius.
   - Customer can order only products marked available for that day.
   - Vendor sees only limited order summary before acceptance.
   - Complete customer phone, address and invoice details unlock only after accepted order transaction succeeds.
   - Rs 15 platform fee is deducted once, linked to order ID, after valid vendor acceptance.
   - Wallet disputes preserve original transactions and create separate reversal entries.

5. Prepare evidence:
   - Redacted Gemini API logs.
   - Gemini / Google AI Studio or Vertex AI usage screenshots.
   - Supabase audit rows for Gemini, orders and wallet deductions.
   - Razorpay test or live top-up proof.
   - Real vendor/customer pilot notes.
   - Expense and simple P&L summary.
   - Three-minute demo script and recording steps.

6. Prepare submission text:
   - 500 to 1,000 word English narrative.
   - AI-versus-human responsibility table.
   - Reused-code disclosure for any older combined SabSewa prototype code.
   - Category impact explanation under Small Business Services.

## Acceptance Criteria

- At least three Gemini workflows run with real API calls and create audit rows.
- Demo video shows live Gemini results and resulting business actions.
- Submission documents disclose reused older SabSewa prototype work honestly.
- AWS S3 remains documented as permitted storage, not as a replacement for Google Cloud/Gemini.
- No secrets are committed to GitHub.
- The project can be tested from mobile app and responsive CRM paths using the same Supabase backend.

## Do Not Do

- Do not claim pre-existing SabSewa HyperLocal code was newly created during the hackathon.
- Do not fake Gemini responses for the demo.
- Do not store sensitive customer or payment information in Gemini logs.
- Do not move application image storage to Google Workspace/Drive.
- Do not include SabSewa Pro, Job or SHG in the submission.
