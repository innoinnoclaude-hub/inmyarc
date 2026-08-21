import { createClient } from "@supabase/supabase-js";

/**
 * Values pasted into a hosting dashboard often arrive wrapped across lines.
 * Neither a Supabase URL nor a key ever contains whitespace, so strip it —
 * otherwise a stray newline reaches Headers.set() and the whole app dies with
 * "Failed to execute 'set' on 'Headers': Invalid value" before it renders.
 */
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, "") : "");

const url = clean(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** A truncated or malformed key should show the setup screen, not crash. */
export const isConfigured =
  /^https?:\/\/\S+$/.test(url) && key.length >= 20;

/**
 * A single shared client. No auth — this is an internal portal behind the
 * team's own deployment, so the anon key + permissive RLS is deliberate.
 */
export const supabase = createClient(
  isConfigured ? url : "https://placeholder.supabase.co",
  isConfigured ? key : "placeholder",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);
