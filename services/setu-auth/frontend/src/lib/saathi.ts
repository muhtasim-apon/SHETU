/** Typed fetch wrapper for the Shetu Saathi patient APIs.
 *  Served by the common backend (same as auth) — defaults to port 8000. */

const SAATHI_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("shetu_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function saathiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SAATHI_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
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
      "Connection error. Please try again.";
    throw new Error(detail);
  }
  return body as T;
}

export const saathiGet = <T>(path: string) => saathiFetch<T>(path);
export const saathiPost = <T>(path: string, data?: unknown) =>
  saathiFetch<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
export const saathiPatch = <T>(path: string, data?: unknown) =>
  saathiFetch<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined });
export const saathiDelete = <T>(path: string) =>
  saathiFetch<T>(path, { method: "DELETE" });

/** Build an authorized URL for binary downloads (e.g. PDF). */
export function saathiPdfUrl(path: string): string {
  return `${SAATHI_URL}${path}`;
}

export function downloadWithAuth(path: string, filename: string): Promise<void> {
  return fetch(`${SAATHI_URL}${path}`, { headers: authHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error("Download failed.");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
}
