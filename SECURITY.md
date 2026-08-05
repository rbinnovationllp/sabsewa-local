# Security Policy

SabSewa Local is proprietary software owned by Rashi Bhartiya Innovation LLP.

## Reporting Vulnerabilities

Report suspected vulnerabilities privately to `support@sabsewa.in`. Do not publish exploit details, secrets, screenshots of private dashboards, or customer/vendor data in public issues, chats, forums, or social media.

Include:

- A short description of the issue.
- Affected route, screen, or workflow.
- Steps to reproduce using non-production data where possible.
- Potential impact.

## Secret Handling

Never commit or share:

- Supabase service role keys.
- AWS access keys.
- Razorpay secrets or webhook secrets.
- MSG91 credentials.
- Firebase service account JSON/private keys.
- Gemini API keys.
- Production `.env` files.
- Android/iOS signing material.

Secrets must live only in approved runtime secret stores such as EC2 environment files, Supabase secrets, Firebase/Google Cloud secret storage, or GitHub Actions secrets.

## Repository Rules

- Keep the repository private.
- Require two-factor authentication for collaborators.
- Use least-privilege access.
- Remove access immediately when a contributor leaves.
- Protect the main branch with pull requests and no force-push.
- Do not distribute debug builds.

## Production Security Baseline

Production APIs should require authentication, role checks, device metadata, rate limits, request validation, HTTPS, and backend-side business logic for payments, settlement, credit, subscriptions, and commission calculations.
