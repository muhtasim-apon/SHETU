/** Typed fetch wrapper around the FastAPI backend. */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

/** Throws an Error carrying the backend `detail` message on non-2xx. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: string } | null)?.detail ??
      "Something went wrong. Please try again.";
    throw new Error(detail);
  }

  return body as T;
}

export function signUp(data: SignUpData): Promise<MessageResponse> {
  return request<MessageResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function signIn(data: SignInData): Promise<AuthResponse> {
  return request<AuthResponse>("/api/v1/auth/signin", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getMe(token: string): Promise<UserProfile> {
  return request<UserProfile>("/api/v1/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}
