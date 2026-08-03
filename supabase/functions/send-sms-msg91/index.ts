type SupabaseSmsHookEvent = {
  user?: {
    id?: string;
    phone?: string;
  };
  sms?: {
    otp?: string;
  };
};

const MSG91_SEND_OTP_URL = "https://control.msg91.com/api/v5/otp";
const INDIAN_E164_RE = /^\+91[6-9]\d{9}$/;

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `+91******${digits.slice(-4)}` : "+91******";
}

function getRequiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function validateHookRequest(request: Request) {
  const expectedSecret = Deno.env.get("SUPABASE_SEND_SMS_HOOK_SECRET");
  if (!expectedSecret) return;

  const suppliedSecret =
    request.headers.get("x-supabase-hook-secret") ||
    request.headers.get("x-hook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (suppliedSecret !== expectedSecret) {
    throw new Response(JSON.stringify({ error: "Unauthorized SMS hook request" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    validateHookRequest(request);

    const event = (await request.json()) as SupabaseSmsHookEvent;
    const phone = String(event.user?.phone || "").trim();
    const otp = String(event.sms?.otp || "").trim();

    if (!INDIAN_E164_RE.test(phone)) {
      console.warn("MSG91 OTP blocked for invalid phone format", { phone: maskPhone(phone) });
      return new Response(JSON.stringify({ error: "Invalid Indian mobile number" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!/^\d{4,8}$/.test(otp)) {
      console.warn("MSG91 OTP blocked because Supabase supplied an invalid OTP shape", {
        phone: maskPhone(phone),
      });
      return new Response(JSON.stringify({ error: "Invalid OTP payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const authKey = getRequiredSecret("MSG91_AUTH_KEY");
    const templateId = getRequiredSecret("MSG91_OTP_TEMPLATE_ID");
    const senderId = Deno.env.get("MSG91_SENDER_ID") || "SABSEW";
    const mobileWithoutPlus = phone.replace("+", "");

    const url = new URL(MSG91_SEND_OTP_URL);
    url.searchParams.set("template_id", templateId);
    url.searchParams.set("mobile", mobileWithoutPlus);
    url.searchParams.set("authkey", authKey);
    url.searchParams.set("otp", otp);
    url.searchParams.set("sender", senderId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const responseText = await response.text();

    if (!response.ok) {
      console.error("MSG91 OTP send failed", {
        status: response.status,
        phone: maskPhone(phone),
        providerResponse: responseText.slice(0, 300),
      });
      return new Response(JSON.stringify({ error: "SMS delivery provider failed" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    console.info("MSG91 OTP sent", {
      phone: maskPhone(phone),
      userId: event.user?.id || null,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("MSG91 SMS hook error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "SMS hook failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
