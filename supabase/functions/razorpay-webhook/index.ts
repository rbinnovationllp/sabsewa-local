import { handleOptions, jsonResponse, proxyToBackend, requireMethod } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, ["POST"]);
    return proxyToBackend(request, "/api/payments/razorpay/webhook");
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

