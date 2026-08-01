# SabSewa Local Deadline Gap And Readiness Report

Date: 2026-07-31

Deadline focus: Build with Gemini XPRIZE submission closes on August 17, 2026 at 1:00 PM PDT.

Official references checked on 2026-07-31:

- Build with Gemini XPRIZE rules: https://xprize.devpost.com/rules
- Google Play testing requirements for new personal developer accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play test-track setup guidance: https://support.google.com/googleplay/android-developer/answer/9845334

## Executive Go/No-Go

Current recommendation: **No-go for unrestricted production launch today. Go for controlled Bengaluru pilot only after the listed critical checks pass.**

Reason: the repository contains substantial implementation for the core marketplace, Gemini workflows, wallet rules, legal notices, PWA export and Android build preparation. However, several production-critical workflows are still not end-to-end verified against the live Supabase project, Razorpay, AWS S3, deployed API, real devices and role-separated accounts.

## Official Hackathon Requirements Confirmed

The official Devpost rules require category selection, code repository access, text description, a demonstration video under three minutes, a working project demonstration, meaningful Gemini/Google technology usage, disclosure of pre-existing work, product-running evidence, revenue/expense evidence and user evidence.

The rules do not require Google Play public production availability by August 17, but the project must be accessible for judging through a working website, functioning demo or test build.

## Google Play Risk

Google Play requirements depend on account type and creation date.

- If the account is a new personal developer account created after November 13, 2023, Google requires a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access.
- Internal testing is fast and useful for APK/AAB validation, but it does not replace the closed-test production-access requirement for affected personal accounts.
- Therefore, the PWA at `https://www.sabsewa.in` is the safest public access path before the hackathon deadline while Play Console testing continues.

Owner must check the Play Console dashboard for the exact account requirement shown for this account.

## Verified From Repository

Implemented in code but still requiring live verification:

- Customer registration flow and profile/address/policy persistence checks.
- Mobile OTP code path is implemented but not active or verified until Supabase Phone Auth, SMS provider, India `+91` delivery and DLT/template requirements are configured and a real OTP is received.
- Email OTP code path is implemented but disabled until production SMTP and numeric OTP template delivery are verified.
- Supabase-backed persistent mobile sessions using secure storage where available.
- English, Hindi and Kannada launch-language foundation.
- Customer-friendly nearby-shop discovery without raw vendor/terminal IDs.
- Vendor daily availability, brand/variant catalogues and vendor-specific prices.
- Cart delivery-charge/free-delivery/estimated-window snapshot.
- Protected customer details until vendor acceptance.
- Backend order acceptance and Rs 15 wallet-fee deduction architecture.
- Revised vendor activation payment policy: Rs 5,500 first payment, split into Rs 500 activation/service fee and Rs 5,000 refundable advance wallet.
- Razorpay backend order/signature verification flow in code.
- Gemini inventory capture, ordering, smart rejection/support and translation/audit routes in code.
- PWA export script generating `.htaccess`, manifest, service worker, offline shell and PWA icons.
- Android EAS profiles for internal APK and production AAB.
- Legal pages for Terms, Customer Terms, Vendor Terms, Privacy, Credit Disclaimer, Refund/Cancellation and Grievance/Dispute.

Local checks already passed:

- TypeScript compile check.
- Backend syntax checks for changed server files.
- Localization foundation smoke test.
- Hostinger web export and PWA post-processing.
- Static web bundle scan for server-only secret names and localhost backend URL.

## Critical Gaps Before Pilot Revenue

Severity P0:

- Run all required incremental SQL runners in the live Supabase `sabsewa-local` project and confirm success.
- Test RLS with separate customer, vendor, rider and admin accounts.
- Test customer registration with the enabled method on live Supabase after migrations.
- Do not mark Mobile OTP production-ready until a real Indian SMS is received, verified, and profile/address/Terms persistence is confirmed.
- Test vendor registration, verification and terminal activation.
- Test first vendor Razorpay activation payment and ledger split.
- Test Razorpay webhook/callback idempotency and duplicate payment handling.
- Test customer order placement against a verified vendor with available products.
- Test vendor acceptance hides details before acceptance, deducts Rs 15 exactly once, and reveals details only after valid acceptance.
- Test partial fulfilment and customer quote/partial approval.
- Test wallet statement/dispute evidence and admin reversal path.
- Test AWS S3 image upload limits, private object access and quota accounting.
- Test Gemini live calls and verify rows in `gemini_agent_logs`.
- Upload latest `mobile/dist` to Hostinger and test `https://www.sabsewa.in` deep links and installability.

Severity P1:

- Build a fresh Android internal APK and test on a physical Android phone.
- Start Google Play internal testing and closed testing immediately if the Play Console account requires 12 testers for 14 days.
- Add production monitoring and backup runbooks for EC2, Supabase, S3, Razorpay and Gemini.
- Add low-connectivity and offline-state tests for PWA/mobile.
- Complete Hindi and Kannada translations across every critical screen, not just the foundation/core paths.
- Get Indian legal/accounting review for Terms, vendor fee treatment, GST invoices, refunds and retention language.

Severity P2:

- Company CRM polish for demand hotspots, translation-cost dashboard and recovery views.
- Accessibility pass.
- More catalogue seed data and controlled pilot onboarding scripts.
- Additional automated tests for concurrency, duplicate webhooks and RLS isolation.

## Critical Path To August 17, 2026

Target by August 2:

- Apply Supabase migrations.
- Confirm RLS isolation.
- Verify backend API health and PM2 restart process.
- Upload refreshed PWA to Hostinger.

Target by August 5:

- Complete one full customer-vendor order lifecycle in test mode.
- Complete first vendor activation payment in Razorpay test mode.
- Confirm wallet ledger and Rs 15 acceptance deduction evidence.
- Generate Gemini live audit logs for inventory capture and conversational ordering.

Target by August 8:

- Onboard 3 to 5 informed Bengaluru pilot vendors.
- Collect lawful consent for screenshots, testimonials and evidence sharing.
- Run controlled live/pilot transactions if legally/accounting-approved.
- Begin or continue Google Play internal and closed testing.

Target by August 12:

- Finalize demo video script and collect screen recordings.
- Export revenue, expense, Gemini usage and user evidence.
- Freeze high-risk code changes.

Target by August 15:

- Complete Devpost draft with repository, live URL, testing credentials/instructions and disclosure of reused/pre-existing work.
- Verify support contact, privacy, refund, grievance and account-deletion information.

Target by August 17:

- Submit before 1:00 PM PDT.

## Manual Owner Actions

- Enter and maintain production secrets only in secure server/EAS/hosting environments.
- Run Supabase SQL in the dashboard and capture success screenshots.
- Complete Razorpay account/KYC and switch between test/live keys carefully.
- Confirm AWS S3 IAM policy and bucket access.
- Check Play Console account-specific testing requirement.
- Collect pilot vendor/customer consent and evidence.
- Obtain legal/accounting review before taking real money at scale.

## Current Final Recommendation

Do not advertise SabSewa Local as fully production-ready yet.

Proceed with a controlled Bengaluru pilot after the P0 checks pass. Use the PWA as the primary public access channel for the hackathon deadline, while preparing Android closed testing and AAB submission in parallel.
