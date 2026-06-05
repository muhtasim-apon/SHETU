"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("shetu_token");
    if (!token) { router.replace("/auth/signin"); return; }
    const raw = localStorage.getItem("shetu_user");
    if (raw) {
      try {
        const user = JSON.parse(raw) as UserProfile;
        if (user.role === "mother") {
          router.replace("/dashboard/mother");
        } else {
          router.replace("/dashboard/patient");
        }
      } catch {
        router.replace("/auth/signin");
      }
    } else {
      router.replace("/auth/signin");
    }
  }, [router]);

  return null;
}
