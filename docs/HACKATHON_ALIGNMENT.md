# SabSewa Local Hackathon Alignment

Updated: 2026-07-27

This document aligns SabSewa Local with the Build with Gemini XPRIZE guidance supplied by the project owner.

## Infrastructure Decision

AWS S3 is allowed for SabSewa Local. The project does not need to move product images, vendor documents or generated files to Google Workspace or Google Drive.

Approved production split:

- Supabase: authentication, PostgreSQL database, Row-Level Security, realtime data and backend data services.
- AWS S3: product images, shared catalogue images, KYC/business documents and generated downloadable files.
- Gemini through Google AI Studio or Vertex AI: required AI-powered business workflows.
- Razorpay: vendor advance-wallet deposits and top-ups.
- Expo React Native: customer, vendor and rider mobile application.
- Responsive web portals: Company Master CRM and Vendor CRM.

Google Workspace is not the correct storage layer for thousands of product images. It may be used for normal company documents, but not as the application file-storage backend.

## Qualification Risks To Control

SabSewa Local must not be presented as only a renamed older SabSewa HyperLocal Marketplace. The submission must clearly disclose:

- The earlier combined SabSewa project existed before the hackathon.
- Any reused boilerplate, screens, data models or backend patterns were reused as prior/prototype work.
- The standalone SabSewa Local repository, Supabase project, Gemini-powered operating workflows and launch/pilot evidence were prepared during the hackathon period.
- Pre-existing product-specific work must not be claimed as newly created.

Recommended owner action: request written eligibility clarification from Devpost/XPRIZE support if a substantial part of the HyperLocal Marketplace existed before May 19, 2026.

## Required Gemini Business Workflows

Gemini must operate meaningful live workflows, not only a help chatbot. The minimum SabSewa Local demonstration set is:

- Vendor inventory extraction from shelf, invoice or handwritten-list images.
- Multilingual customer ordering that converts natural language into a structured cart.
- Product-name, unit and quantity normalisation across Indian languages.
- Vendor fulfilment support for unavailable, substituted or partially accepted items.
- Customer-friendly shortage, rejection and substitution messages.
- Unserved-locality and category demand analysis for vendor recruitment.
- AI-assisted vendor onboarding and catalogue creation.

Human confirmation remains mandatory for:

- Published product catalogues.
- Product prices and daily availability.
- Order acceptance or rejection.
- Customer credit approval and limits.
- Wallet top-ups, refunds and adjustments.
- Any legally or financially significant action.

## Gemini Evidence To Preserve

Every production Gemini workflow should create an audit record containing:

- Timestamp.
- Workflow name.
- Model name.
- Backend route or function name.
- Redacted input summary.
- Structured output.
- User/vendor/admin who reviewed the result.
- Human approval, rejection or override.
- Processing time.
- Error status, if any.

Do not send or store passwords, complete customer addresses, full phone numbers, payment credentials or unnecessary personal data in Gemini prompts or logs.

## Submission Evidence Checklist

Collect and retain:

- GitHub repository access for judges.
- Three-minute demo video showing live Gemini calls and resulting business actions.
- 500 to 1,000 word English narrative explaining how Gemini operates the business.
- Gemini API usage dashboard screenshots.
- Redacted `gemini_agent_logs` examples.
- Supabase rows showing order, wallet and audit linkage.
- Razorpay test/live evidence for vendor wallet top-ups.
- Real vendor onboarding conversations or signed pilot confirmations.
- Real customer test orders and feedback.
- Revenue evidence for Rs 15 order-fee deductions where available.
- Expense disclosure covering Gemini/Google Cloud, Supabase, AWS S3, Razorpay, support, marketing and operations.
- Simple profit-and-loss summary for the hackathon period.
- Clear disclosure of reused code and newly created hackathon-period work.

## Demo Acceptance Criteria

Before final handover to Gemini or Devpost submission, demonstrate:

- A vendor uploads or captures an inventory image and receives Gemini-created draft items.
- The vendor reviews and saves approved catalogue items.
- A customer enters a multilingual order request and Gemini creates a structured cart.
- The customer places an order using only products available for that day.
- The vendor sees only limited order details before acceptance.
- Acceptance and the Rs 15 platform fee deduction happen through one backend transaction.
- Customer contact and complete address unlock only after acceptance.
- A rejected or partial order triggers Gemini-assisted customer communication.
- Relevant rows exist in Supabase for Gemini logs, order audit, wallet transaction and fee evidence.

## Current Alignment Conclusion

The codebase can continue using AWS S3 without creating a disqualification problem. The bigger eligibility risk is not S3; it is proving that SabSewa Local is a real Gemini-operated business created and launched within the hackathon period, with live users, genuine evidence and transparent disclosure of reused earlier SabSewa work.
