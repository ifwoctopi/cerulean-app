import { createClient } from "@supabase/supabase-js";

// Read from .env: SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (or the legacy SUPABASE_ANON_KEY).
const env = import.meta.env;
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
const key = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } })
  : null;

export const connected = !!supabase;
