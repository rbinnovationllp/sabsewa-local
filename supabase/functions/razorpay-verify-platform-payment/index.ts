import { handleOptions, jsonResponse, proxyJsonToBackend, requireMethod, readJson } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, ["POST"]);
    const body = await readJson(request);
    const vendorId = body.vendor_id || body.vendorId;
    if (!vendorId) return jsonResponse({ success: false, error: "vendor_id is required." }, 400);

    return proxyJsonToBackend(
      request,
      `/api/vendor/billing/${encodeURIComponent(vendorId)}/verify-platform-payment`,
      {
        ...body,
        payment_scope: "vendor_to_sabsewa_platform_payment",
        customer_order_payment: false,
      },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
