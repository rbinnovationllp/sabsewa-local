# Gemini XPRIZE Hackathon Compliance Checklist

## Non-Negotiable Rule

To avoid disqualification or low scoring, SabSewa Local must clearly use Gemini / Google Cloud for core AI business workflows. Codex-generated screens and boilerplate are useful, but the submission must not look like only a standard CRUD app.

## Required Gemini Workflows

### 1. Multimodal Vendor Inventory Capture

Status: Required

Demo requirement:
- Vendor opens inventory capture.
- Vendor uploads/takes a product shelf, invoice, or handwritten list photo.
- Backend calls Gemini.
- Gemini returns structured inventory JSON.
- Vendor reviews and saves items.
- System stores Gemini audit log.

Evidence to collect:
- Screen recording.
- Example input image.
- Gemini response JSON.
- Database row in `gemini_agent_logs`.

### 2. Conversational Customer Ordering

Status: Required

Demo requirement:
- Customer types or speaks an order in Hindi/English/local language.
- Backend calls Gemini.
- Gemini converts request into cart JSON.
- Customer confirms generated cart.
- Order is placed.

Evidence to collect:
- Customer input.
- Gemini parsed response.
- Confirmed cart screen.
- Created order row.

### 3. Smart Rejection And Customer Support

Status: Required

Demo requirement:
- Vendor rejects an order.
- Vendor gives simple reason.
- Backend calls Gemini.
- Gemini generates friendly customer notification and suggested alternatives.
- Audit log stores original reason and Gemini response.

Evidence to collect:
- Rejected order.
- Gemini-generated customer message.
- Audit log row.

## Recommended Technical Architecture

Mobile app:
- Expo React Native.
- Customer, vendor, rider, and admin screens.

Backend:
- Serverless endpoint or Node/Express route.
- Calls `@google/genai`.
- Stores structured result in Supabase.

Database:
- Supabase PostgreSQL.
- RLS for user/vendor/order isolation.
- `gemini_agent_logs` table for proof.

Storage:
- AWS S3 is acceptable for product images, shared catalogue images, documents and generated files.
- Google Workspace/Drive should not be used as the application image-storage backend.
- S3 usage does not replace the need for real Gemini / Google Cloud usage in core AI workflows.

## Do Not Do This

- Do not use OpenAI or Codex as the core AI engine in the hackathon demo.
- Do not hide Gemini usage in only documentation.
- Do not hardcode fake Gemini responses for the recorded demo.
- Do not present static mockups as live AI agents.
- Do not skip audit logging.

## Submission Proof Checklist

- [ ] Gemini API key configured in backend environment.
- [ ] Google AI Studio or Vertex AI project/account evidence available.
- [ ] At least one live Gemini call for inventory capture.
- [ ] At least one live Gemini call for conversational ordering.
- [ ] At least one live Gemini call for smart rejection/support.
- [ ] Logs show model name, timestamp, workflow type, and response JSON.
- [ ] Logs redact sensitive customer address, phone, password and payment details.
- [ ] Demo video shows the mobile app and the AI result.
- [ ] 3 to 5 real/local vendor conversations or onboarding proof collected.
- [ ] Real or pilot order evidence and Rs 15 fee deduction evidence collected where available.
- [ ] Expenses disclosed for Gemini/Google Cloud, Supabase, AWS S3, Razorpay, support, marketing and operations.
- [ ] Reused code from the older combined SabSewa prototype disclosed clearly.
- [ ] Devpost write-up mentions Gemini-powered workflows clearly.

## Fast Build Priority

1. Finish HLM cart and order placement.
2. Add Gemini endpoint wrapper.
3. Add inventory capture screen.
4. Add conversational ordering screen.
5. Add smart rejection flow.
6. Add `gemini_agent_logs`.
7. Record demo with real test data.
