import dotenv from "dotenv";
dotenv.config();


import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Required Supabase URL is missing.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Required Supabase service credential is missing.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

