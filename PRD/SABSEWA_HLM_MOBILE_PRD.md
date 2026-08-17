# SabSewa Local - HyperLocal Marketplace Mobile PRD

## 1. Product Summary

SabSewa Local HyperLocal Marketplace is a mobile-first local commerce platform for neighborhood shops, kirana stores, vegetable sellers, fruit vendors, pharmacies, bakeries, restaurants, dairy shops, tiffin providers, and other nearby daily-need vendors.

The product must let customers place local orders quickly, let vendors manage catalog and orders with minimal typing, and use Google Gemini / Google Cloud for the core AI workflows required by the Build with Gemini XPRIZE Hackathon.

## 2. Hackathon Compliance Rule

Codex may be used for app scaffolding, UI, database schema, navigation, and boilerplate. However, the project must not present Codex-generated logic as the core AI innovation.

The hackathon-facing AI workflows must be powered by Gemini / Google Cloud:

1. Gemini multimodal inventory capture.
2. Gemini conversational ordering in Indian languages.
3. Gemini smart rejection, support, and alternative-shop reasoning.

These Gemini workflows must be visible in the demo video and backed by logs, screenshots, or database audit records.

## 2.1 Bengaluru Launch Language Scope

SabSewa Local will launch first in Bengaluru, Karnataka with functional support for English, Hindi and Kannada.

- English remains the fallback language.
- Hindi and Kannada must use reviewed local translation files for essential customer, vendor, registration, cart, delivery, wallet and legal workflows.
- Gemini Flash may assist only with permitted dynamic marketplace text that is not covered by local files.
- Passwords, OTPs, payment data, phone numbers, precise addresses and other sensitive personal data must never be sent to Gemini for translation.
- Registration, ordering, wallet top-up and payment flows must not depend on Gemini translation availability.
- User language preference must be saved locally and, for registered users, in the user profile.

## 3. Target Users

### Customer
- Finds nearby verified local shops.
- Browses vendor catalog.
- Adds products to cart.
- Places orders using manual cart or conversational text/voice.
- Tracks order status and delivery.
- Receives clear notifications when an order is accepted, rejected, packed, or out for delivery.

### Vendor / Shop Owner
- Registers shop and terminal.
- Adds items manually or via Gemini photo-to-inventory.
- Manages item price and availability.
- Accepts, rejects, packs, and completes orders.
- Views customer credit ledger, completed-order reports, and vendor advance balance transactions.
- Gets Gemini-generated rejection/support suggestions when rejecting an order.

### Rider / Delivery Partner
- Receives assigned delivery order.
- Updates delivery status.
- Shares live location for tracking.

### Admin / Terminal Admin
- Verifies vendors and terminals.
- Monitors orders, vendor activity, and exceptions.
- Reviews Gemini audit logs for AI actions.

## 4. Core Mobile Modules

### 4.1 Public HLM Landing
- Display `SabSewa Local` and `Everything Local. One Trusted Marketplace.`
- Show logo, brand colours, language selector, location selector and search by shop, category or product.
- Show categories such as kirana, vegetables, fruits, medical, bakery, restaurant, dairy, and tiffin.
- Provide clear customer actions: Shop from Nearby Stores, Register as Customer, Continue Shopping, Order Again, Recent Shops and My Orders where applicable.
- Provide clear vendor actions: Register Your Shop, Vendor Login, Open Vendor Dashboard, Manage Today's Items, View Orders and Wallet Balance where applicable.
- Do not display raw Vendor IDs or Terminal IDs to customers.

### 4.2 Customer Vendor Discovery
- Show nearby approved vendors.
- Filter by category, distance, and open/closed status.
- Allow customer to pick a customer-friendly shop or branch without seeing raw internal vendor or terminal IDs.
- Display shop name, category, locality or partial address, approximate distance, open status, verified badge and currently available products. If similar shop names exist, distinguish them by locality, partial address and distance, not by Vendor ID or Terminal ID.
- Show vendor details, phone, address, and available catalog.

### 4.3 Catalog And Cart
- Display item image, name, price, availability, and quantity controls.
- Add/remove items from cart.
- Show cart total, delivery address, phone, and notes.
- Place order against selected vendor and terminal.

### 4.4 AI-Powered Conversational Ordering Using Gemini
- Customer enters text or voice order in English, Hindi, or another Indian language.
- Customer must first select a nearby verified shop by location, category, shop name or product/item search.
- The normal customer-facing page title must be `Place Your Order`, not `Gemini Conversational Ordering`.
- Customer-facing ordering screens must never require or display raw `vendor_id` or `terminal_id`; these identifiers remain internal, hidden, non-editable and backend-validated.
- Customer-facing copy should say: `Select a nearby shop and type or speak what you need. We will prepare a cart for your review before placing the order.`
- Gemini converts request into structured cart JSON.
- App shows extracted items for customer confirmation.
- Customer can edit quantities before placing order.
- Gemini must match requested items only against the selected shop's currently active and available-today catalogue, identify unavailable items, and never invent products, prices, stock or availability.

Required output format:

```json
{
  "language": "hi",
  "items": [
    {
      "name": "tomato",
      "local_name": "tamatar",
      "quantity": 2,
      "unit": "kg",
      "confidence": 0.92
    }
  ],
  "missing_clarifications": []
}
```

### 4.5 Vendor Catalog Management
- Vendor can select from company catalog.
- Vendor can upload custom product photo.
- Vendor can set price and availability.
- Vendor can manage items per terminal.
- Vendor storage starts at 100 MB and increases only after genuinely completed orders: 250 MB after 101 orders, 500 MB after 501 orders, 1 GB after 2,001 orders, and 2 GB after more than 5,000 orders.
- Product images must be compressed to about 100-150 KB and limited to essential catalogue use. Videos are not allowed in the standard storage allocation.
- Orders, invoices, credit records, wallet entries and transaction history must remain database records, not duplicate image/PDF files.
- Vendor CRM must display storage usage, warn at 80%, 90% and 100%, and block uploads beyond quota.
- Vendors requiring more than 2 GB require manual review or a paid storage package.
- Vendors may contribute product images to a moderated shared product catalogue only after confirming they own or have permission to use the image and authorise reuse by other registered vendors.
- Approved shared images are stored once and referenced by multiple vendors; reuse does not consume the receiving vendor's storage quota.
- SabSewa Local may reject or remove misleading, copyrighted, branded, inappropriate or poor-quality shared images. Prices, stock, offers and units remain vendor-specific.
- SabSewa Local must maintain a rights-compliant master product catalogue for kirana/general stores, vegetable shops and fruit shops. The master catalogue may store standard product titles, category/subcategory, common Indian-language names, units, brand/pack size where applicable, keywords, spelling variants and an image status field.
- Master catalogue entries must not include copied descriptions, photos, logos or other copyrighted material from Amazon, Flipkart, BigBasket, Zepto, Blinkit or any other third-party commercial website unless Rashi Bhartiya Innovation LLP has documented commercial-use permission.
- Master product images may be accepted only from vendor-contributed images with explicit shared-use consent, manufacturer/distributor permission, properly licensed commercial-reuse images, or SabSewa-commissioned photography.
- The vendor shared-image consent checkbox must remain unchecked by default. Consent records must store vendor/user ID, vendor ID, consent timestamp, terms version, original filename, checksum and declared ownership.
- Approved master images must be private S3 objects served through CloudFront or time-limited presigned URLs. Other vendors may reference approved master images without creating another S3 copy and without consuming their 100 MB vendor product-image quota.
- If no authorised image is available, the product must show a neutral placeholder and remain `image_pending`. The system must never silently substitute or copy an unauthorised third-party image.
- Company admins must have a copyright/takedown workflow that disables disputed images immediately while preserving consent, moderation and audit history.
- The master catalogue is a reference only. Every vendor must have a separate shop catalogue/index in `vendor_items` where that vendor controls price, stock, brand/variant, pack size, daily availability, expiry details and substitution policy.
- Brand and pack-size variants must remain distinct purchasable items. Example: Sunflower 5 kg atta, Aastha 5 kg atta and Raja 10 kg atta must not be merged into one indistinguishable item.
- Vendors may choose `Show Price`, `Ask Vendor` or `Market Price` for each listing. Hidden/market/on-request items require vendor quotation and customer approval before final order acceptance.
- If a requested brand or pack size is unavailable, the app and Gemini must not silently substitute another item. Alternatives require customer approval.
- If no suitable registered vendor is available within the permitted service area, display: `We’re sorry. No SabSewa Local vendor matching your requirement is currently listed in your area. As more people start using SabSewa Local in your locality, our team will work to identify and onboard suitable nearby vendors.`
- Provide `Request a Vendor in My Area` to record locality, required category/requested items and consent for notification when a suitable vendor becomes available.

### 4.5.0 Registration And Trusted Device Login
- Customer registration collects only necessary service data: name, OTP-verified mobile number, preferred language, delivery address, optional location coordinates and current Terms/Privacy acceptance.
- Vendor registration collects owner/entity name, shop/trade name, category, shop address/geolocation, OTP-verified mobile number, KYC/business information placeholder, terms/privacy acceptance, verification status and activation/payment status.
- Customer profile, primary address and Terms/Privacy acceptance must be persisted before the app displays a registration-success confirmation.
- The customer success message must be localized: `Congratulations! You are now registered as a SabSewa Local customer. You can start shopping online from trusted shops in your locality.`
- Registration submission must be idempotent and must prevent repeated taps from creating duplicate profiles, duplicate addresses or duplicate policy-acceptance records.
- Do not implement literal permanent login. Use Supabase refresh sessions, secure device storage, server-side device-session records, logout and device revocation.
- The login screen must offer `Trust this device`. A trusted-device record is created only after OTP verification and user confirmation.
- New vendor device/terminal activation must require OTP verification, terminal ownership validation, active/verified vendor status, device limits and audit logging.

### 4.5.0A Installable Web/PWA Requirements
- The responsive web application at `https://www.sabsewa.in` must include a valid web app manifest, app icons, theme/background colours, standalone display mode, service worker, offline shell and deep-link support.
- PWA installation must be optional and user-controlled; the application must not claim or attempt forced permanent installation.
- The PWA and native mobile application must use the same authorised Supabase project, AWS S3 storage and backend business rules.
- The static web application must not expose server-only keys. Final production web persistent login should use secure, HttpOnly, SameSite cookies where supported by the architecture.

### 4.5.1 Daily Product Availability
- Vendor Dashboard must provide a clearly visible `Today's Availability` screen.
- Supported daily statuses: Available, Limited Stock, Temporarily Unavailable, Out of Stock and Available on Request.
- Vendors can update one product or multiple selected products together using large simple controls.
- Vendors can update daily quantity, daily price, expected restock date/time and reason.
- Vendors can choose whether to keep last confirmed status, confirm availability every day or automatically mark selected fresh products unavailable each morning.
- Customers see only currently orderable products by default. Unavailable and out-of-stock items must not be added to cart.
- Backend order creation must recheck availability, quantity, brand/pack variant, price/quotation requirement and vendor/terminal status.
- Every availability change must be recorded in `vendor_item_availability_audit` with previous status, new status, quantity, reason, restock time, changed user/device and timestamp.

### 4.6 Gemini Inventory Capture
- Vendor takes a photo of shelf, paper list, invoice, or handwritten stock note.
- Gemini extracts item name, category, price, quantity, and unit.
- Vendor reviews extracted draft before saving.
- Saved items are inserted into vendor catalog only after vendor confirmation.

Required output format:

```json
{
  "items": [
    {
      "name": "Amul Milk",
      "category": "dairy",
      "price": 68,
      "quantity": 10,
      "unit": "liter",
      "confidence": 0.88
    }
  ],
  "needs_vendor_review": true
}
```

### 4.7 Vendor Order Management
Order statuses:

1. `pending`
2. `accepted`
3. `packed`
4. `out_for_delivery`
5. `completed`
6. `rejected`

Vendor must be able to:
- Accept pending order.
- Reject pending order with reason.
- Mark accepted order as packed.
- Mark packed order as out for delivery.
- Mark delivered order as completed.

### 4.8 Gemini Smart Rejection And Support
When vendor rejects an order:
- Vendor selects or enters reason.
- Gemini rewrites reason into a friendly customer message.
- Gemini suggests alternatives, such as partial fulfillment or similar nearby vendors if inventory data is available.
- System logs original reason, Gemini message, model name, timestamp, and final customer message.

### 4.9 Rider And Delivery Tracking
- Vendor/admin assigns rider.
- Rider views assigned order.
- Rider updates order status.
- Customer/vendor can see live tracking while order is out for delivery.
- Delivery screens must show only a reasonable estimated delivery window, not guaranteed countdown promises.
- Customer-facing delivery copy must state: `The delivery time shown is an estimate provided by the vendor and is not a guaranteed deadline. SabSewa Local does not support unsafe or unrealistic delivery commitments. Actual delivery time may vary, and road safety will always take priority over speed.`
- The application must not display 7-minute, 10-minute or similar fixed ultra-fast delivery promises, rank delivery personnel by speed, encourage unsafe fulfilment or penalise riders solely for missing an unrealistic deadline.
- Delivery estimates may vary because of stock availability, preparation time, traffic, weather, distance, safety considerations and other operational conditions.

### 4.10 Credit Ledger
- Vendor can view customer-wise credit balances.
- Vendor can record offline payment received.
- Ledger is not a wallet and must not hold company money.
- Company does not collect, escrow, auto-deduct, or settle vendor/customer credit.

### 4.11 Direct Payment And Vendor Advance Balance
- Customer order payment is direct between the customer and the concerned vendor.
- SabSewa Local and Rashi Bhartiya Innovation LLP do not collect, settle, refund, or recover vendor order amounts.
- Vendor can view completed order totals and payment notes for reporting.
- Every new vendor must make an initial Rs 5,500 Razorpay payment before becoming eligible to receive orders.
- The initial payment is split into a one-time non-refundable Rs 500 setup, activation and platform-service charge plus Rs 5,000 credited to the refundable vendor advance wallet.
- Subsequent standard top-ups are Rs 5,000 and do not include another activation/service charge.
- SabSewa Local supports two vendor pricing models: GST-inclusive category-based platform facilitation fee per accepted real-world order, or an optional monthly accepted-order plan chosen and paid by the vendor.
- If a vendor is on the category pay-per-order model, SabSewa Local deducts the backend-resolved GST-inclusive platform facilitation fee from the vendor advance balance only when the vendor securely confirms and accepts a real-world order, before customer contact and full delivery details are unlocked.
- Current category pay-per-order gross fees are Rs 15 for vegetables/fruits, Rs 20 for kirana/general stores and Rs 25 for restaurants/pharmacies. GST is included in these amounts and must not be added on top.
- If a vendor has an active monthly accepted-order plan, orders covered within the monthly allowance must not also be charged the category pay-per-order fee. Usage must be counted against the active monthly plan period.
- Monthly plan final prices, included GST, and required refundable security balance must be shown clearly. Refundable security is not company revenue and must not be treated as monthly service fee.
- Current monthly plans are Local Starter, Local Growth, Local Pro and Local Enterprise, with accepted-order allowances of 500, 1,000, 2,000 and 5,000 respectively. Plan pricing must remain configurable through backend/database configuration.
- Monthly plan upgrades may take effect after payment. Downgrades or switching back to category pay-per-order pricing should normally take effect after the current paid billing period unless Master Admin authorizes a documented exception. No retrospective refund should be automatically created for past accepted orders.
- When a monthly allowance is exhausted, the vendor must be clearly offered upgrade, renewal, switch to category pay-per-order pricing for future accepted orders, or order-receiving pause. No silent extra charge is allowed.
- When the required refundable security balance is below the plan minimum, the vendor must be notified of the exact top-up amount and new orders must stop until the required balance is restored.
- Once the vendor formally accepts an order and the applicable pricing charge or monthly-plan usage record is created, the company will not refund, reverse or adjust it merely because the vendor later claims that the order was cancelled, not completed, settled privately or handled outside the platform.
- Reversal or correction may be considered only for a company-confirmed duplicate deduction, technical error, unauthorised transaction or correction required under applicable law.
- New orders automatically stop when the available advance balance falls below the required operational minimum or applicable backend-resolved category fee. Existing accepted orders must still be completed and applicable charges must still be recorded.
- If a vendor voluntarily closes the account, the refund preview must show current balance, the Rs 500 activation/service charge already collected and not deducted again, unpaid completed-order fees, authorised adjustments, and estimated eligible refund before submission.

### 4.13 Vendor Delivery Settings
- Vendors or terminal operators may configure minimum order value for free delivery, delivery fee below that value, service radius, estimated delivery window, delivery availability and optional pickup facility.
- These settings must be validated on the backend and recorded in an audit table.
- Before the customer confirms an order, the cart must display item subtotal, delivery charge, free-delivery threshold, amount still required for free delivery where applicable, estimated delivery window, total payable amount and whether delivery is by the vendor or another authorised provider.
- The confirmed order must store a snapshot of the applicable threshold, delivery charge, provider type and estimated delivery window. A vendor must not change the confirmed order delivery charge without explicit customer consent.

### 4.12 Vendor Product Responsibility And Verification
- Vendors are responsible for the accuracy, legality, safety, quality, quantity, price, packaging and description of products supplied through SabSewa Local.
- Customers should be prompted, where reasonably possible, to check product quantity, packaging and seals, expiry date, visible condition, invoice and price, and whether delivered items match the confirmed order.
- Product quality, quantity, substitution, price, refund and replacement complaints should initially be resolved between the customer and concerned vendor. SabSewa Local may provide transaction evidence and complaint channels without attempting to remove statutory consumer rights.
- Every vendor must complete neutral business verification before appearing to customers, including proprietor/entity name, public shop/trade name, business address, verified phone, authorised representative, category, PAN/GSTIN where applicable, FSSAI/drug/category licences where required, shop photos, location verification and accuracy declaration.
- Company CRM must record verification status, reviewed documents, reviewer, date, expiry and discrepancies.
- SabSewa Local must not collect, investigate, rank or disclose a vendor's religion, and must not treat a vendor differently because religion differs from religious or cultural wording in a shop name.

### 4.14 Vendor Catalogue Setup After Registration
- After registration, verification and activation, a vendor must be guided to create the store catalogue before receiving commercial orders.
- The setup screen must not use one long product dropdown. It must provide a searchable, category-based, mobile-friendly multi-select Master Product Catalogue.
- Search must support product title, brand, category, English/Hindi/Kannada/local names, synonyms and common spellings where records exist.
- A vendor may select several master products and choose **Add selected items to my store**. This creates vendor-specific `vendor_items` rows that reference the relevant `master_product_catalog` row and does not create duplicate master records.
- Vendor-specific fields must remain outside the master product record: price, price visibility, daily availability, stock, maximum order quantity, branch/terminal, private image and review status.
- Products without authorised images must show a neutral category/product placeholder and remain searchable/orderable if otherwise active.
- Vendors must have a clearly visible **Can't find an item? Add a new product** flow with product name, local name, category, brand, variant, pack size, unit, description, optional price, price visibility, optional image, availability and barcode/SKU/EAN where available.
- Before a new vendor product is created, the backend must check likely duplicates using normalised name, brand, variant, pack size, barcode, synonyms and spelling/transliteration fields.
- A valid vendor-created item may be added immediately to that vendor's own catalogue as `pending_review`, but it must not be described as a company-verified master product until moderation is complete.
- Vendor-submitted master-catalogue candidates must enter a Company CRM moderation queue. Admins may approve, reject, request correction, link to an existing master product or promote the submission into the master catalogue.
- Image reuse consent must be unchecked by default. Shared reuse requires the vendor's explicit rights declaration, timestamp, terms version, source vendor/user, filename/hash and moderation approval.
- Vendor images, master images and submission evidence must use AWS S3/private storage controls, signed uploads, validation, compression, metadata removal, duplicate checks and moderation. Third-party e-commerce product images must not be copied or hotlinked without documented commercial reuse permission.

## 5. Data Entities

Minimum mobile-facing data entities:

- `users`
- `vendors`
- `vendor_terminals`
- `vendor_items`
- `catalog_items`
- `master_product_catalog`
- `master_product_images`
- `master_product_image_consents`
- `master_product_image_takedown_audit`
- `vendor_product_submissions`
- `vendor_product_submission_audit`
- `hyperlocal_orders`
- `order_items`
- `riders`
- `rider_assignments`
- `vendor_credit_ledger`
- `vendor_storage_usage`
- `vendor_storage_files`
- `shared_product_images`
- `gemini_agent_logs`

## 6. Gemini Agent Logs

Every Gemini call must create an audit row:

- `id`
- `agent_type`: `inventory_capture`, `conversational_order`, `smart_rejection`
- `input_type`: `image`, `text`, `voice`
- `input_summary`
- `model`
- `response_json`
- `confidence`
- `user_id`
- `vendor_id`
- `order_id`
- `created_at`

This is important for the hackathon demo because judges need proof that Gemini is orchestrating real workflows.

## 7. Must Fix In Current Mobile Code

1. Complete cart screen. Current `cart.tsx` is not a working React Native screen.
2. Replace `http://localhost:5001` with an environment-based backend URL.
3. Implement `CreditListScreen`; it currently returns `null`.
4. Fix route mismatch between `Catalog.tsx` and actual cart route.
5. Ensure `vendor_id` uses the real vendor table id, not only auth user id.
6. Standardize routing around Expo Router or React Navigation.
7. Add Gemini inventory capture screen and backend endpoint.
8. Add Gemini conversational order screen and backend endpoint.
9. Add Gemini smart rejection endpoint and audit log.
10. Verify item photo storage bucket exists for `vendor-items`.

## 8. MVP Acceptance Criteria

The HLM MVP is acceptable for hackathon demo when:

- A vendor can add at least three products manually.
- A vendor can set up a shop catalogue by searching the Master Product Catalogue, selecting multiple items and adding them to the vendor store.
- A vendor can submit a missing product into the vendor catalogue with pending master-catalogue review status.
- A vendor can upload one shelf/list photo and Gemini extracts draft inventory.
- A customer can create a cart manually.
- A customer can type or speak an order and Gemini converts it to cart items.
- A customer can place an order.
- A vendor can accept or reject the order.
- On rejection, Gemini creates a friendly customer notification and audit log.
- A rider/order tracking demo path is available.
- The demo video clearly shows Gemini API involvement, not only app screens.

## 9. Out Of Scope For First Hackathon MVP

- Customer order payment gateway or settlement by SabSewa Local.
- Company-held customer/vendor order settlement wallet.
- Automatic credit deductions.
- Nationwide rollout.
- Complex loyalty/cashback.
- Fully automated vendor approval without human review.

## Partner Application Workflow

- Partner With Us submissions must show confirmation only after the partner application record is saved in the database.
- Every submitted application must have a public Partner Application ID such as `SSL-P-000123`.
- Applicant confirmation must show applicant name, mobile number, proposed area of operation, Application ID and current status.
- A submitted application is `pending` until Master Admin/Admin review; the applicant must not be told they are an active Marketing Partner until status becomes `active`.
- Duplicate applications using the same mobile number should show the existing Application ID/status instead of creating another record.
- Master Admin CRM must show pending Partner Applications for review and update status to approved, rejected, active, suspended or revoked as applicable.

### Partner KYC, Commission Payment and Compliance - 2026-08-10
- Partner Application collects PAN/tax profile and commission payment method with strict masking and server-side encryption for sensitive payout destination details.
- Partner KYC is mandatory before Partner activation and payout eligibility. Required sections are Identity Proof, Address Proof where needed, Partner Photograph/Selfie, and organization documents for organization applicants.
- Master Admin/authorized staff can verify Partner KYC, verify payment details, activate, suspend, reinstate or terminate Partners with audit trails and reasons.
- Monthly Partner commission statements track eligible revenue, configurable percentage, deductions/TDS, net payable, payout status, date and reference number without automatic fund transfer.
- Partner conduct/confidentiality and protective suspension rules are part of Partner workflow and documentation.
### Vendor Identity Display Rule
Vendor ID is an internal administrative and backend reference. Customer, vendor and partner-facing identification should prioritize owner/vendor name, registered mobile number, shop name and locality/area. Partner attribution must continue to link to the internal Vendor ID in the backend for commission and audit integrity.
