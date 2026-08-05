# Security Hardening Rollout Notes

The current SabSewa Local API contains legacy pilot routes that often receive `vendor_id`, `customer_id`, or `actor_user_id` from the request body or query string. To avoid breaking the pilot, security middleware has been added as reusable building blocks first.

Recommended rollout order:

1. Admin and company routes.
2. Vendor wallet, settlement, storage upload, payment profile, and credit mutation routes.
3. Customer order placement, order history, repayment, and profile routes.
4. Public discovery routes with rate limiting only.
5. Rider routes with rider-token validation plus rate limiting.

Before enforcing JWT globally, update the frontend API helper to attach:

- `Authorization: Bearer <Supabase access token>`
- `x-sabsewa-device-id`
- `x-sabsewa-app-version`
- `x-sabsewa-platform`

Then enable middleware route by route and test each workflow.
