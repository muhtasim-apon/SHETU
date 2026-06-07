"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  BookOpen,
  ClipboardCheck,
  Stethoscope,
  Target,
  User,
  FileText,
  Activity,
} from "lucide-react";

const MODULES = [
  {
    label: "Blog",
    description: "Health articles & tips",
    icon: BookOpen,
    href: "/dashboard/patient/saathi/blog",
    color: "bg-blue-50 text-blue-600 border-blue-100",
  },
  {
    label: "Check-in",
    description: "Daily health check-in",
    icon: ClipboardCheck,
    href: "/dashboard/patient/saathi/checkin",
    color: "bg-green-50 text-green-600 border-green-100",
  },
  {
    label: "Consultancy",
    description: "Connect with doctors",
    icon: Stethoscope,
    href: "/dashboard/patient/saathi/consultancy",
    color: "bg-purple-50 text-purple-600 border-purple-100",
  },
  {
    label: "Goals",
    description: "Track health goals",
    icon: Target,
    href: "/dashboard/patient/saathi/goals",
    color: "bg-orange-50 text-orange-600 border-orange-100",
  },
  {
    label: "Profile",
    description: "Your health profile",
    icon: User,
    href: "/dashboard/patient/saathi/profile",
    color: "bg-pink-50 text-pink-600 border-pink-100",
  },
  {
    label: "Report",
    description: "View health reports",
    icon: FileText,
    href: "/dashboard/patient/saathi/report",
    color: "bg-yellow-50 text-yellow-600 border-yellow-100",
  },
  {
    label: "Vitals",
    description: "Monitor vital signs",
    icon: Activity,
    href: "/dashboard/patient/saathi/vitals",
    color: "bg-red-50 text-red-600 border-red-100",
  },
];

export default function HealthAssistantPage() {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) {
      router.replace("/auth/signin");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F4FAF8]">
      {/* Header */}
      <header className="bg-gradient-to-br from-[#0E7C66] to-[#08231F] text-white px-5 pt-6 pb-8 shrink-0">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => router.push("/dashboard/patient")}
            className="flex items-center gap-1 text-white/70 text-sm mb-4"
          >
            <ChevronLeft size={16} /> Dashboard
          </button>
          <h1 className="text-2xl font-bold">Health Assistant</h1>
          <p className="text-sm text-white/60 mt-1">Manage your health with Saathi</p>
        </div>
      </header>

      {/* Module Grid */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-4">Choose a module to get started</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MODULES.map(({ label, description, icon: Icon, href, color }) => (
            <button
              key={label}
              onClick={() => router.push(href)}
              className={`flex flex-col items-start gap-3 rounded-2xl border p-4 bg-white shadow-sm hover:shadow-md transition text-left ${color}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
