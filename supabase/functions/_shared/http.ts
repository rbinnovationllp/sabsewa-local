export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-supabase-hook-secret, x-webhook-secret, x-edge-secret",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function handleOptions(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function requireMethod(request: Request, methods: string[]) {
  if (!methods.includes(request.method)) {
    throw jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getBackendBaseUrl() {
  return (
    Deno.env.get("BACKEND_BASE_URL") ||
    Deno.env.get("API_BASE_URL") ||
    Deno.env.get("EXPO_PUBLIC_BACKEND_URL") ||
    ""
  ).replace(/\/+$/, "");
}

export function requireEdgeSecret(request: Request, envName = "EDGE_FUNCTION_SECRET") {
  const expected = Deno.env.get(envName);
  if (!expected) return;

  const supplied =
    request.headers.get("x-edge-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (supplied !== expected) {
    throw jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
}

function forwardedHeaders(request: Request, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers(extraHeaders);
  for (const name of [
    "authorization",
    "content-type",
    "x-razorpay-signature",
    "x-supabase-hook-secret",
    "x-webhook-secret",
    "x-forwarded-for",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-sabsewa-edge-function", "true");
  return headers;
}

export async function proxyToBackend(
  request: Request,
  path: string,
  options: { method?: string; body?: BodyInit | null; headers?: Record<string, string> } = {},
) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return jsonResponse(
      { success: false, error: "BACKEND_BASE_URL is not configured for this Edge Function." },
      500,
    );
  }

  const target = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const method = options.method || request.method;
  const response = await fetch(target, {
    method,
    headers: forwardedHeaders(request, options.headers),
    body: method === "GET" || method === "HEAD" ? undefined : options.body ?? request.body,
  });

  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export async function proxyJsonToBackend(request: Request, path: string, body: unknown) {
  return proxyToBackend(request, path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

