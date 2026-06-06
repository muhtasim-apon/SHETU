"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("shetu_token");
    if (!token) {
      router.replace("/auth/signin");
      return;
    }
    const raw = localStorage.getItem("shetu_user");
    if (!raw) {
      router.replace("/auth/signin");
      return;
    }
    try {
      const user = JSON.parse(raw) as UserProfile;
      router.replace(
        user.role === "mother" ? "/dashboard/mother" : "/dashboard/patient",
      );
    } catch {
      router.replace("/auth/signin");
    }
  }, [router]);

  // Deterministic markup so server and client render identically (no hydration
  // mismatch); shown briefly while the redirect above resolves.
  return (
    <div className="min-h-screen bg-[#08231F] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin border-2 border-white/20 border-t-[#0E7C66] rounded-full w-8 h-8" />
        <p className="text-sm text-white/40">Loading your dashboard…</p>
      </div>
    </div>
  );
}
