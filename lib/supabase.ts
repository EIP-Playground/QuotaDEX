import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getSupabaseServerEnv } from "@/lib/env";

export function createServerSupabaseClient() {
  const env = getSupabaseServerEnv();

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export function createAnonSupabaseClient() {
  const env = getPublicEnv();

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
