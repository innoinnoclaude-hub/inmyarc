import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

/**
 * A single shared client. No auth — this is an internal portal behind the
 * team's own deployment, so the anon key + permissive RLS is deliberate.
 */
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);
