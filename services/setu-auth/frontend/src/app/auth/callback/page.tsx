"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Supabase email-confirmation landing page.
 *
 * Supabase verifies the token server-side before redirecting the browser here
 * (via `emailRedirectTo`), so by the time this page loads the email is already
 * confirmed. We simply forward the user to the sign-in page with a success flag.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/auth/signin?verified=1");
    }, 800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen bg-[#08231F] flex items-center justify-center p-4">
      <div className="bg-white max-w-sm w-full rounded-2xl shadow-2xl p-8 text-center">
        <Loader2 size={28} className="animate-spin text-[#0E7C66] mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-[#0E7C66]">Email verified</h1>
        <p className="text-sm text-gray-500 mt-1">Redirecting you to sign in…</p>
      </div>
    </main>
  );
}
