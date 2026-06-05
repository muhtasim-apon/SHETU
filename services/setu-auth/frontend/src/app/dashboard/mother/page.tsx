"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Baby, ChevronRight, Leaf, LogOut, MessageSquare, User, Zap } from "lucide-react";

import type { UserProfile } from "@/lib/api";

const MODULES = [
  {
    id: "pregnancy",
    name: "Pregnancy",
    description: "Track your pregnancy journey, milestones, and prenatal care.",
    icon: Baby,
    href: "/dashboard/mother/pregnancy",
  },
  {
    id: "health-assistant",
    name: "Health Assistant",
    description: "AI-powered chat for health queries and personalised guidance.",
    icon: MessageSquare,
    href: "/dashboard/mother/health-assistant",
  },
  {
    id: "risk-prediction",
    name: "Risk Prediction",
    description: "Predict maternal and fetal health risks based on your vitals.",
    icon: Activity,
    href: "/dashboard/mother/risk-prediction",
  },
  {
    id: "nutrition",
    name: "Nutrition",
    description: "Personalised nutrition plans for you and your baby.",
    icon: Leaf,
    href: "/dashboard/mother/nutrition",
  },
  {
    id: "shetu-lite",
    name: "Shetu Lite",
    description: "Quick access to essential care features on the go.",
    icon: Zap,
    href: "/dashboard/mother/shetu-lite",
  },
] as const;

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function MotherDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("shetu_token");
    if (!token) { router.replace("/auth/signin"); return; }
    const raw = localStorage.getItem("shetu_user");
    if (raw) {
      try { setUser(JSON.parse(raw) as UserProfile); } catch { /* ignore */ }
    }
  }, [router]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const signOut = () => {
    localStorage.removeItem("shetu_token");
    localStorage.removeItem("shetu_user");
    router.replace("/auth/signin");
  };

  return (
    <div className="min-h-screen bg-[#08231F] text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#0E7C66] tracking-widest" style={{ fontFamily: "Georgia, serif" }}>
            SHETU
          </span>
          <span className="text-xs text-white/30">সেতু</span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-none">{user?.full_name ?? "…"}</p>
              <p className="text-xs text-white/40 mt-0.5 capitalize">{user?.role}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#0E7C66] flex items-center justify-center text-sm font-semibold shrink-0">
              {user ? initials(user.full_name) : <User size={16} />}
            </div>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0D2E28] border border-white/10 shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-sm font-semibold">{user?.full_name}</p>
                <p className="text-xs text-white/40 mt-0.5">{user?.email}</p>
              </div>
              <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors">
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-xl font-medium text-white/70">
            Welcome back, <span className="text-white font-semibold">{user?.full_name?.split(" ")[0] ?? "…"}</span>
          </h2>
          <p className="text-sm text-white/40 mt-1">What would you like to explore today?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODULES.map(({ id, name, description, icon: Icon, href }) => (
            <button
              key={id}
              onClick={() => router.push(href)}
              className="group text-left bg-white/5 hover:bg-white/[0.08] border border-white/10 hover:border-[#0E7C66]/50 rounded-2xl p-6 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#0E7C66]/20 flex items-center justify-center">
                  <Icon size={22} className="text-[#0E7C66]" />
                </div>
                <ChevronRight size={18} className="text-white/20 group-hover:text-[#0E7C66] transition-colors mt-1" />
              </div>
              <h3 className="font-semibold text-white">{name}</h3>
              <p className="text-sm text-white/50 mt-1 leading-relaxed">{description}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
