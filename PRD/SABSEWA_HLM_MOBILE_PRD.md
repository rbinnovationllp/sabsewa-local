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
- Explain HyperLocal Marketplace.
- Show categories such as kirana, vegetables, fruits, medical, bakery, restaurant, dairy, and tiffin.
- Provide login/register entry for customer and shop owner.

### 4.2 Customer Vendor Discovery
- Show nearby approved vendors.
- Filter by category, distance, and open/closed status.
- Allow customer to pick vendor and terminal.
- Show vendor details, phone, address, and available catalog.

### 4.3 Catalog And Cart
- Display item image, name, price, availability, and quantity controls.
- Add/remove items from cart.
- Show cart total, delivery address, phone, and notes.
- Place order against selected vendor and terminal.

### 4.4 Gemini Conversational Ordering
- Customer enters text or voice order in English, Hindi, or another Indian language.
- Gemini converts request into structured cart JSON.
- App shows extracted items for customer confirmation.
- Customer can edit quantities before placing order.

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
- SabSewa Local deducts a fixed Rs 15 platform facilitation fee from the vendor advance balance only when the vendor securely confirms and accepts a real-world order, before customer contact and full delivery details are unlocked.
- New orders automatically stop when the available advance balance falls below Rs 515. Existing accepted orders must still be completed and applicable Rs 15 charges must still be recorded.
- If a vendor voluntarily closes the account, the refund preview must show current balance, the Rs 500 activation/service charge already collected and not deducted again, unpaid completed-order fees, authorised adjustments, and estimated eligible refund before submission.

### 4.12 Vendor Product Responsibility And Verification
- Vendors are responsible for the accuracy, legality, safety, quality, quantity, price, packaging and description of products supplied through SabSewa Local.
- Customers should be prompted, where reasonably possible, to check product quantity, packaging and seals, expiry date, visible condition, invoice and price, and whether delivered items match the confirmed order.
- Product quality, quantity, substitution, price, refund and replacement complaints should initially be resolved between the customer and concerned vendor. SabSewa Local may provide transaction evidence and complaint channels without attempting to remove statutory consumer rights.
- Every vendor must complete neutral business verification before appearing to customers, including proprietor/entity name, public shop/trade name, business address, verified phone, authorised representative, category, PAN/GSTIN where applicable, FSSAI/drug/category licences where required, shop photos, location verification and accuracy declaration.
- Company CRM must record verification status, reviewed documents, reviewer, date, expiry and discrepancies.
- SabSewa Local must not collect, investigate, rank or disclose a vendor's religion, and must not treat a vendor differently because religion differs from religious or cultural wording in a shop name.

## 5. Data Entities

Minimum mobile-facing data entities:

- `users`
- `vendors`
- `vendor_terminals`
- `vendor_items`
- `catalog_items`
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
