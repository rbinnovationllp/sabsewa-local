#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

functions=(
  razorpay-create-platform-order
  razorpay-verify-platform-payment
  razorpay-webhook
  razorpay-create-platform-refund
)

for function_name in "${functions[@]}"; do
  echo "Deploying ${function_name} ..."
  npx supabase functions deploy "${function_name}"
done

echo "All SabSewa Local platform Razorpay Edge Functions deployed."
