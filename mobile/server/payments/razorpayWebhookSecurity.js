import crypto from "crypto";

export function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = String(signature);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function deriveRazorpayWebhookEventId(body, rawBody) {
  if (body?.id) return String(body.id);
  const digest = crypto.createHash("sha256").update(rawBody).digest("hex");
  return `payload_${digest}`;
}
