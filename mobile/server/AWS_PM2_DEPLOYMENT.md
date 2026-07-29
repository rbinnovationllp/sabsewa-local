# SabSewa Local AWS PM2 Deployment

SabSewa Local remains a mobile application. PM2 is used only to keep the Node.js API backend running on AWS so the mobile app can call it through `EXPO_PUBLIC_BACKEND_URL`.

## AWS Runtime

- Host: AWS EC2, Lightsail, or any Node-capable AWS server.
- Process manager: PM2.
- Backend folder: `mobile/server`.
- API process name: `sabsewa-local-api`.
- Default port: `5001`.

## Required Environment

Create `mobile/server/.env` on the AWS server:

```env
NODE_ENV=production
PORT=5001

SUPABASE_URL=replace_with_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=replace_with_supabase_service_role_key

GEMINI_API_KEY=replace_with_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
GEMINI_PROVIDER=google_ai_studio

RAZORPAY_MODE=test
RAZORPAY_KEY_ID=replace_with_razorpay_key_id
RAZORPAY_KEY_SECRET=replace_with_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=replace_with_razorpay_webhook_secret

AWS_REGION=ap-south-1
AWS_S3_BUCKET=sabsewa-local-product-images-624719611353-ap-south-1-an

PUBLIC_APP_URL=https://www.sabsewa.in
```

Keep the Supabase service-role key, Gemini API key, Razorpay secret, webhook secret, and AWS secret credentials only on the AWS backend. Do not put them in the Expo mobile/web app or GitHub.

## Start On AWS

```bash
cd /path/to/sabsewa/mobile/server
npm install
npm install -g pm2
npm run pm2:start
pm2 save
pm2 startup
```

Use the command printed by `pm2 startup`, then run `pm2 save` again.

## Update Deployment

```bash
cd /path/to/sabsewa/mobile/server
npm install
npm run pm2:reload
```

## Mobile App API URL

Set this before building the mobile app:

```env
EXPO_PUBLIC_BACKEND_URL=https://api.sabsewa.in
```

For physical Android/iOS devices, do not use `localhost`. The mobile app must call the AWS HTTPS API domain.

## Production Notes

- Put Nginx or an AWS load balancer in front of port `5001`.
- Use HTTPS for Razorpay callbacks, vendor advance-balance top-ups, order placement, and rider tracking.
- Restrict inbound security group access to HTTP/HTTPS and SSH.
- Store Razorpay, Supabase, and AWS credentials in server environment variables, not in source code.
- The vendor advance balance is a company-held advance against platform fees for real-world local services. It is not virtual currency, digital content, or a customer order-payment settlement account.
