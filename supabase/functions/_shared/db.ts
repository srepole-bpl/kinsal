// Service-role Supabase client. This bypasses RLS and is ONLY ever created
// inside an edge function — the service role key lives in Deno.env on the
// server and is never sent to the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
