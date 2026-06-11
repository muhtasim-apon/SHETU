import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser-side Supabase client for use in client components.
 *
 * The access token (stored as `shetu_token`) expires after ~1 hour. This
 * client persists the full session (access + refresh token) and lets
 * supabase-js auto-refresh it in the background. Whenever the session is
 * refreshed we mirror the new access token into `shetu_token` so the rest of
 * the app (which reads it directly for FastAPI calls) stays in sync —
 * otherwise an expired token causes "new row violates row level security
 * policy" once auth.uid() can no longer be resolved.
 */
export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  browserClient.auth.onAuthStateChange((_event, session) => {
    if (typeof window === "undefined") return;
    if (session?.access_token) {
      window.localStorage.setItem("shetu_token", session.access_token);
    }
  });

  return browserClient;
}

/** Call after sign-in to seed the persisted session from the auth response. */
export async function setSupabaseSession(access_token: string, refresh_token: string) {
  const sb = createClient();
  await sb.auth.setSession({ access_token, refresh_token });
}

/** Call on sign-out to clear the persisted session. */
export async function clearSupabaseSession() {
  const sb = createClient();
  await sb.auth.signOut();
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
