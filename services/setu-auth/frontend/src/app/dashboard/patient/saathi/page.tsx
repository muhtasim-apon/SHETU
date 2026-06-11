"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BookOpen, ClipboardCheck, FileText, HeartPulse,
  Stethoscope, Target, User, ChevronLeft, ChevronRight,
} from "lucide-react";

const CARDS = [
  { name: "Health Profile", desc: "Set up your health profile", icon: User, href: "/dashboard/patient/saathi/profile" },
  { name: "Log Vitals", desc: "BP, SpO₂, pulse & more", icon: HeartPulse, href: "/dashboard/patient/saathi/vitals" },
  { name: "Daily Check-in", desc: "Track your daily wellness", icon: ClipboardCheck, href: "/dashboard/patient/saathi/checkin" },
  { name: "Health Goals", desc: "Set & track health targets", icon: Target, href: "/dashboard/patient/saathi/goals" },
  { name: "Health Report", desc: "AI-powered PDF reports", icon: FileText, href: "/dashboard/patient/saathi/report" },
  { name: "Find Doctor", desc: "BMDC-registered doctors", icon: Stethoscope, href: "/dashboard/patient/saathi/consultancy" },
  { name: "Health Blog", desc: "WHO / CDC / NHS articles", icon: BookOpen, href: "/dashboard/patient/saathi/blog" },
];

export default function SaathiHubPage() {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) router.replace("/auth/signin");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F4FAF8]">
      <header className="bg-gradient-to-br from-[#0E7C66] to-[#08231F] text-white px-5 pt-6 pb-10 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Dashboard
          </button>
          <Image src="/images/logo.png" alt="Shetu logo" width={32} height={32} className="h-8 w-8 object-contain mt-3" />
          <h1 className="text-2xl font-bold mt-1">Shetu Saathi</h1>
          <p className="text-sm text-white/60 mt-1">Your personal health companion</p>
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 -mt-5 pb-12 space-y-3">
        {CARDS.map(({ name, desc, icon: Icon, href }) => (
          <button
            key={name}
            onClick={() => router.push(href)}
            className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-11 h-11 rounded-xl bg-[#E8F5F0] flex items-center justify-center shrink-0">
              <Icon size={22} className="text-[#0E7C66]" />
            </div>
            <div className="text-left flex-1">
              <p className="font-medium text-gray-800">{name}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300" />
          </button>
        ))}
      </main>
    </div>
  );
}
