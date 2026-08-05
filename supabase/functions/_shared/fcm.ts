import { supabaseAdmin } from "./supabase.ts";

function base64Url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const clean = pem
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken() {
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || "Unable to obtain Firebase access token");
  return String(json.access_token);
}

export async function tokensForUsers(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin()
    .from("device_push_tokens")
    .select("token")
    .in("user_id", ids)
    .eq("provider", "fcm")
    .eq("consent_status", "granted")
    .is("revoked_at", null);

  if (error) throw error;
  return [...new Set((data || []).map((row: { token: string }) => row.token).filter(Boolean))];
}

export async function sendFcm(payload: {
  tokens?: string[];
  user_ids?: string[];
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}) {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const accessToken = await getAccessToken();
  const tokens = [
    ...(payload.tokens || []),
    ...(payload.user_ids?.length ? await tokensForUsers(payload.user_ids) : []),
  ].filter(Boolean);

  if (!projectId || !accessToken || !tokens.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
      reason: !tokens.length ? "No FCM tokens found" : "Firebase HTTP v1 env vars are not configured",
    };
  }

  let sent = 0;
  let failed = 0;
  const data = Object.fromEntries(
    Object.entries(payload.data || {}).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );

  for (const token of tokens) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data,
        },
      }),
    });
    if (response.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skipped: false };
}

