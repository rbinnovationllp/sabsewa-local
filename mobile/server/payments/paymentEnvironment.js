export function getRazorpayMode() {
  const configuredMode = String(
    process.env.RAZORPAY_ENVIRONMENT || process.env.RAZORPAY_MODE || ""
  ).toLowerCase();
  const keyId = process.env.RAZORPAY_KEY_ID || "";

  if (configuredMode === "live") return "live";
  if (configuredMode === "test") return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return "test";
}

export function getPaymentReadiness() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const publicApiUrl = process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || "https://api.sabsewa.in";
  const publicAppUrl = process.env.PUBLIC_APP_URL || "https://www.sabsewa.in";
  const mode = getRazorpayMode();

  const checks = {
    razorpay_live_key_id: mode === "live" && keyId.startsWith("rzp_live_"),
    razorpay_live_key_secret_backend_only: mode === "live" && Boolean(keySecret) && !keySecret.includes("replace_with"),
    live_webhook_secret_configured: mode === "live" && Boolean(webhookSecret) && !webhookSecret.includes("replace_with"),
    production_callback_https: publicAppUrl.startsWith("https://"),
    production_webhook_https: publicApiUrl.startsWith("https://"),
    signature_verification_implemented: true,
    duplicate_event_idempotency_implemented: true,
    atomic_wallet_crediting_implemented: true,
    reconciliation_test_confirmed: process.env.RAZORPAY_LIVE_RECONCILIATION_TESTED === "true",
  };

  const livePaymentsEnabled = mode === "live" && Object.values(checks).every(Boolean);

  return {
    mode,
    live_payments_enabled: livePaymentsEnabled,
    banner: livePaymentsEnabled
      ? "LIVE MODE - REAL PAYMENTS ENABLED"
      : "TEST MODE - NO REAL MONEY WILL BE COLLECTED",
    payment_message: livePaymentsEnabled
      ? "Live Razorpay payments are enabled. Real vendor payments may be collected only after final operational approval."
      : "This is a test transaction. No real money will be collected, no production wallet balance will be credited and the vendor account will not be activated for commercial orders.",
    checks,
  };
}
