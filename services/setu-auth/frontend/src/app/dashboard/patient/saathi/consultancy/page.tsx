"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Phone, ExternalLink, Video } from "lucide-react";
import { saathiGet } from "@/lib/saathi";

interface Doctor {
  id?: string; bmdc_number?: string; full_name: string; qualification?: string;
  specialty: string; district?: string; facility_name?: string; facility_address?: string;
  phone?: string; telemedicine_available: boolean; bio?: string; source: string;
}
interface Resp {
  doctors: Doctor[]; emergency_contacts: Record<string, { number: string; description: string }>;
  useful_links: { name: string; url: string }[]; total: number; source: string; disclaimer: string;
}

const SPECIALTIES = [
  ["general", "General"], ["medicine", "Internal Medicine"], ["cardiology", "Cardiology"],
  ["diabetes", "Diabetes"], ["ortho", "Orthopaedics"], ["neuro", "Neurology"],
  ["derma", "Dermatology"], ["psychiatry", "Psychiatry"], ["ent", "ENT"],
];

function initials(n: string) {
  return n.replace(/^Dr\.?\s*/i, "").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

export default function ConsultancyPage() {
  const router = useRouter();
  const [specialty, setSpecialty] = useState("medicine");
  const [district, setDistrict] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [teleOnly, setTeleOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function search() {
    setLoading(true); setError("");
    try {
      const q = `specialty=${specialty}&district=${encodeURIComponent(district)}&limit=20`;
      setData(await saathiGet<Resp>(`/api/v1/doctors/search?${q}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const doctors = (data?.doctors ?? []).filter((d) => !teleOnly || d.telemedicine_available);

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Find a Doctor</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">Emergency</p>
          <div className="grid grid-cols-3 gap-2">
            {[["999", "Emergency"], ["16767", "Helpline"], ["199", "Ambulance"]].map(([num, label]) => (
              <a key={num} href={`tel:${num}`} className="bg-white rounded-xl py-2 text-center">
                <p className="font-bold text-red-600">{num}</p>
                <p className="text-[10px] text-gray-500">{label}</p>
              </a>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SPECIALTIES.map(([v, l]) => (
            <button key={v} onClick={() => setSpecialty(v)}
              className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full ${specialty === v ? "bg-[#0E7C66] text-white" : "bg-white text-gray-600"}`}>{l}</button>
          ))}
        </div>

        <div className="flex gap-2">
          <input placeholder="District (optional)" value={district} onChange={(e) => setDistrict(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <button onClick={search} className="bg-[#0E7C66] text-white px-4 rounded-xl text-sm">Search</button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setTeleOnly(false)} className={`text-sm px-3 py-1 rounded-full ${!teleOnly ? "bg-[#0E7C66] text-white" : "bg-white text-gray-600"}`}>All</button>
          <button onClick={() => setTeleOnly(true)} className={`text-sm px-3 py-1 rounded-full ${teleOnly ? "bg-[#0E7C66] text-white" : "bg-white text-gray-600"}`}>Telemedicine</button>
          {data && <span className="text-xs text-gray-400 ml-auto">{data.source === "bmdc_live" ? "Live from BMDC" : "Local directory"}</span>}
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}
        {loading && <p className="text-sm text-gray-400 text-center">Searching...</p>}

        <div className="space-y-3">
          {doctors.map((d, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-[#E8F5F0] flex items-center justify-center text-[#0E7C66] font-semibold shrink-0">
                  {initials(d.full_name)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{d.full_name}</p>
                  {d.bmdc_number && <p className="text-xs text-gray-400">BMDC: {d.bmdc_number}</p>}
                  {d.qualification && <p className="text-xs text-gray-500">{d.qualification}</p>}
                  <span className="inline-block mt-1 text-xs bg-[#E8F5F0] text-[#0E7C66] px-2 py-0.5 rounded-full">{d.specialty}</span>
                  {d.telemedicine_available && (
                    <span className="inline-flex items-center gap-1 ml-1 text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
                      <Video size={11} /> Telemedicine
                    </span>
                  )}
                  {d.facility_name && <p className="text-xs text-gray-500 mt-1">{d.facility_name}{d.district ? `, ${d.district}` : ""}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="flex-1 flex items-center justify-center gap-1 bg-green-500 text-white rounded-xl py-2 text-sm">
                    <Phone size={14} /> Call
                  </a>
                )}
                <a href="https://www.bmdc.org.bd/member-information.php" target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm">
                  <ExternalLink size={14} /> Verify on BMDC
                </a>
              </div>
            </div>
          ))}
          {!loading && doctors.length === 0 && <p className="text-sm text-gray-400 text-center">No doctors found.</p>}
        </div>

        {data && <p className="text-xs text-gray-400 text-center">{data.disclaimer}</p>}
      </main>
    </div>
  );
}
