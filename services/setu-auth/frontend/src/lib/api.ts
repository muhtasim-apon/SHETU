/**
 * Auth API — runs directly against Supabase from the browser.
 *
 * Auth used to proxy through the FastAPI backend, but Python's httpx hits SSL
 * handshake timeouts to Supabase under WSL2. The browser uses native OS
 * networking, so calling Supabase Auth directly is both reliable and the
 * standard Supabase pattern. The data-API routes (vitals, reports, …) still go
 * through the FastAPI backend with the returned access_token.
 */
import { createClient as createSupabaseJs } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Fresh client with NO persisted session — we manage the token in localStorage
// ourselves (stored as `shetu_token`) to stay compatible with the rest of the app.
function authClient() {
  return createSupabaseJs(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Role = "admin" | "mother" | "patient";

export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  phone?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  phone: string | null;
  created_at: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface MessageResponse {
  message: string;
}

/** Map raw Supabase auth errors to short, user-safe messages. */
function cleanError(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("already") && lowered.includes("registered"))
    return "An account with this email already exists.";
  if (lowered.includes("password") && (lowered.includes("weak") || lowered.includes("least")))
    return "Password is too weak. Use at least 8 characters.";
  if (lowered.includes("email not confirmed"))
    return "Email not confirmed. Please verify your email first.";
  if (lowered.includes("invalid login credentials"))
    return "Invalid email or password.";
  return message || "Something went wrong. Please try again.";
}

/** Load the profile row (created by the DB trigger) using an authed client. */
async function fetchProfile(
  userId: string,
  accessToken: string,
  fallbackEmail?: string,
): Promise<UserProfile> {
  const client = createSupabaseJs(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("Profile not found. Please contact support.");
  }

  return {
    id: data.id,
    email: data.email ?? fallbackEmail ?? "",
    role: data.role,
    full_name: data.full_name,
    phone: data.phone ?? null,
    created_at: data.created_at ?? null,
  };
}

// Base URL used in the confirmation email's redirect link. Prefer an explicit
// NEXT_PUBLIC_SITE_URL (set this to the deployed origin in Vercel) so the link
// never points at a bare `localhost` that "refused to connect"; fall back to
// the current browser origin for local dev.
function siteOrigin(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return undefined;
}

export async function signUp(data: SignUpData): Promise<MessageResponse> {
  const origin = siteOrigin();
  const emailRedirectTo = origin ? `${origin}/auth/callback` : undefined;

  const { data: result, error } = await authClient().auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo,
      data: {
        role: data.role,
        full_name: data.full_name,
        phone: data.phone ?? null,
      },
    },
  });

  if (error) throw new Error(cleanError(error.message));
  if (!result.user) throw new Error("Sign up failed. Please try again.");

  return { message: "Verification email sent. Please check inbox." };
}

export async function signIn(data: SignInData): Promise<AuthResponse> {
  const { data: result, error } = await authClient().auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) throw new Error(cleanError(error.message));
  if (!result.session || !result.user) throw new Error("Invalid email or password.");

  const accessToken = result.session.access_token;
  const u = result.user;

  let profile: UserProfile;
  try {
    profile = await fetchProfile(u.id, accessToken, data.email);
  } catch {
    // RLS blocked the profiles read or the row is missing — fall back to the
    // user_metadata captured at signup so login still succeeds.
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    profile = {
      id: u.id,
      email: u.email ?? data.email,
      role: (meta.role as Role) ?? "patient",
      full_name: (meta.full_name as string) ?? (u.email ?? "User"),
      phone: (meta.phone as string) ?? null,
      created_at: u.created_at ?? null,
    };
  }

  return {
    access_token: accessToken,
    token_type: "bearer",
    user: profile,
  };
}

export async function getMe(token: string): Promise<UserProfile> {
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired token.");
  return fetchProfile(data.user.id, token, data.user.email ?? undefined);
}
