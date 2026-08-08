# SabSewa Local Mobile

Expo React Native mobile app scaffold for the HLM hackathon MVP.

## Screens To Build First

1. Vendor inventory capture with Gemini.
2. Customer conversational ordering with Gemini.
3. Cart and checkout.
4. Vendor order dashboard with smart rejection.
5. Rider tracking.

## Important

Do not call Gemini directly from the mobile app. The mobile app must call the backend, and the backend calls Gemini. This protects the Gemini API key and creates server-side audit logs.

## 2026-08-08 Vendor Onboarding, KYC Upload and Payment Readiness

- Vendor onboarding now follows the mandatory sequence: registration, KYC document upload, KYC verification, payment unlock, Razorpay payment verification, and final activation.
- Vendor KYC document sections are flexible: Identity Proof and Address/Business Proof are mandatory; Restricted/Regulated Business Licence is conditional and optional for ordinary Vegetable Shops.
- KYC upload now starts from Take Photo, Gallery or Files selection. The separate manual upload button was removed from the final workflow.
- Upload status is backend-driven: Missing changes to Uploaded only after Supabase Storage succeeds and a `vendor_kyc_documents` row is created.
- KYC uploads use the private Supabase bucket `vendor-kyc-private`, with signed preview and delete/re-upload support.
- Backend KYC upload diagnostics now report the failing stage, including bucket lookup/creation, MIME validation, image compression, storage upload and metadata insert.
- Browser/file-picker uploads infer MIME from filename when the picker reports `application/octet-stream`, so JPG/JPEG/PNG/WEBP/PDF documents are handled correctly.
- Vendor payment configuration is category-aware through `vendor_fee_rules`; `Vegetable Shops` maps to the vegetables fee rule after running `supabase/RUN_FIX_VENDOR_ONBOARDING_PRICING_AND_ACTIVATION_2026_08_08.sql`.
- Required manual Supabase SQL before production KYC/payment testing: `supabase/RUN_FIX_VENDOR_KYC_PRIVATE_BUCKET_2026_08_08.sql`, `supabase/RUN_FIX_VENDOR_KYC_DOCUMENT_FLEXIBLE_TYPES_2026_08_08.sql`, and `supabase/RUN_FIX_VENDOR_ONBOARDING_PRICING_AND_ACTIVATION_2026_08_08.sql`.
