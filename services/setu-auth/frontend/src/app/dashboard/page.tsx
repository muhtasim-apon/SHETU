"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { UserProfile } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("shetu_token");
    if (!token) {
      router.replace("/auth/signin");
      return;
    }
    const raw = localStorage.getItem("shetu_user");
    if (raw) {
      try {
        setUser(JSON.parse(raw) as UserProfile);
      } catch {
        setUser(null);
      }
    }
  }, [router]);

  const signOut = () => {
    localStorage.removeItem("shetu_token");
    localStorage.removeItem("shetu_user");
    router.replace("/auth/signin");
  };

  return (
    <main className="min-h-screen bg-[#08231F] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-800">
          Welcome, {user?.full_name ?? "…"}!
        </h1>
        {user && (
          <p className="text-sm text-gray-500 mt-2">
            Role: {user.role} &nbsp;|&nbsp; Email: {user.email}
          </p>
        )}
        <button
          onClick={signOut}
          className="mt-6 w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
