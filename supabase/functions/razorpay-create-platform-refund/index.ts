import { handleOptions, jsonResponse, readJson, requireEnv, requireMethod } from "../_shared/http.ts";

function requireRefundSecret(request: Request) {
  const expected = requireEnv("PLATFORM_REFUND_SECRET");
  const supplied =
    request.headers.get("x-platform-refund-secret") ||
    request.headers.get("x-edge-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (supplied !== expected) {
    throw jsonResponse({ success: false, error: "Unauthorized platform refund request." }, 401);
  }
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, ["POST"]);
    requireRefundSecret(request);

    const body = await readJson(request);
    const paymentId = String(body.razorpay_payment_id || body.payment_id || "").trim();
    const amountRupees = Number(body.amount);
    const notes = body.notes && typeof body.notes === "object" ? body.notes : {};

    if (!paymentId) return jsonResponse({ success: false, error: "razorpay_payment_id is required." }, 400);
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      return jsonResponse({ success: false, error: "Positive refund amount in rupees is required." }, 400);
    }

    const keyId = requireEnv("RAZORPAY_KEY_ID");
    const keySecret = requireEnv("RAZORPAY_KEY_SECRET");
    const auth = btoa(`${keyId}:${keySecret}`);

    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        speed: body.speed === "optimum" ? "optimum" : "normal",
        notes: {
          ...notes,
          payment_scope: "platform_payment_vendor_to_sabsewa",
          customer_order_payment: "false",
          refund_reason: String(body.reason || "SabSewa platform refund").slice(0, 250),
        },
        receipt: String(body.receipt || `sabsewa-platform-refund-${Date.now()}`).slice(0, 40),
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return jsonResponse(
        { success: false, error: json.error?.description || json.error || "Razorpay refund failed.", details: json },
        response.status,
      );
    }

    return jsonResponse({
      success: true,
      payment_scope: "platform_payment_vendor_to_sabsewa",
      customer_order_payment: false,
      refund: json,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

