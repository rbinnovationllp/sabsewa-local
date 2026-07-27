import dotenv from "dotenv";
dotenv.config();

console.log(">>> LOADED SUPABASE_URL =", process.env.SUPABASE_URL);
console.log(">>> LOADED SERVICE_ROLE =", process.env.SUPABASE_SERVICE_ROLE_KEY ? "AVAILABLE" : "MISSING");

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("⚠️ Environment variable SUPABASE_URL is missing.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("⚠️ Environment variable SUPABASE_SERVICE_ROLE_KEY is missing.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
