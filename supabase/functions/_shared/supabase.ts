import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEnv } from "./http.ts";

export function supabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

