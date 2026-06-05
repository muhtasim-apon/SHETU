import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser-side Supabase client for use in client components. */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
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
