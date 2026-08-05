$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..")

$functions = @(
  "razorpay-create-platform-order",
  "razorpay-verify-platform-payment",
  "razorpay-webhook",
  "razorpay-create-platform-refund"
)

foreach ($functionName in $functions) {
  Write-Host "Deploying $functionName ..." -ForegroundColor Cyan
  npx.cmd supabase functions deploy $functionName
}

Write-Host "All SabSewa Local platform Razorpay Edge Functions deployed." -ForegroundColor Green
