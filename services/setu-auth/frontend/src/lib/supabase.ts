import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client for use in client components.
 *
 * Auth in this app is handled by the FastAPI backend, which returns a real
 * Supabase Auth `access_token` (stored as `shetu_token`). We forward that token
 * on every request so PostgREST runs the query as the `authenticated` role with
 * the correct `auth.uid()` — otherwise RLS policies like
 * `profile_id = auth.uid()` reject every read/write and the data never loads.
 */
export function createClient() {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("shetu_token")
      : null;

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Server-side Supabase client for server components / route handlers.
 * Pass a cookie store (e.g. from `next/headers`) when reading/writing sessions.
 */
export function createServerSupabaseClient(cookieStore: {
  get: (name: string) => { value: string } | undefined;
  set?: (name: string, value: string, options: CookieOptions) => void;
}) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set?.(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set?.(name, "", options);
      },
    },
  });
}
