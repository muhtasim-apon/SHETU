"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, AlertTriangle, FileText } from "lucide-react";
import { saathiGet, saathiPost } from "@/lib/saathi";

interface Flag { type: string; severity: string; message: string; value?: number; normal_range?: string; }
interface Vital {
  id: string; recorded_at?: string; systolic_bp?: number; diastolic_bp?: number;
  oxygen_saturation?: number; pulse_bpm?: number; temperature_c?: number;
  weight_kg?: number; has_flags?: boolean; flag_details?: Flag[];
}
interface LogResult { vital: Vital; flags: Flag[]; severity: string; }
interface Trend { metric: string; unit: string; data: { date: string; avg: number; min: number; max: number }[]; }

const SEV_BORDER: Record<string, string> = {
  mild: "border-yellow-300", moderate: "border-orange-400",
  elevated: "border-orange-500", severe: "border-red-500",
};

function bpDot(sys?: number) {
  if (!sys) return "bg-gray-300";
  if (sys >= 160) return "bg-red-500";
  if (sys >= 140) return "bg-orange-500";
  if (sys >= 130) return "bg-yellow-400";
  return "bg-green-500";
}

function fmt(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function VitalsPage() {
  const router = useRouter();
  const [sys, setSys] = useState(""); const [dia, setDia] = useState("");
  const [spo2, setSpo2] = useState(""); const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState(""); const [resp, setResp] = useState("");
  const [weight, setWeight] = useState(""); const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LogResult | null>(null);
  const [history, setHistory] = useState<Vital[]>([]);
  const [error, setError] = useState("");
  const [trend, setTrend] = useState<Trend | null>(null);
  const flagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    loadHistory();
  }, [router]);

  async function loadHistory() {
    try {
      const data = await saathiGet<{ vitals: Vital[] }>("/api/v1/vitals/history?limit=5");
      setHistory(data.vitals);
    } catch { /* ignore */ }
  }

  async function loadTrend() {
    try {
      setTrend(await saathiGet<Trend>("/api/v1/vitals/trends?metric=systolic_bp&days=30"));
    } catch { /* ignore */ }
  }

  async function submit() {
    setError("");
    if (!sys && !spo2) { setError("Enter at least Blood Pressure or SpO₂."); return; }
    setSaving(true);
    try {
      const body = {
        systolic_bp: sys ? +sys : null, diastolic_bp: dia ? +dia : null,
        oxygen_saturation: spo2 ? +spo2 : null, pulse_bpm: pulse ? +pulse : null,
        temperature_c: temp ? +temp : null, respiratory_rate: resp ? +resp : null,
        weight_kg: weight ? +weight : null, notes: notes || null,
      };
      const res = await saathiPost<LogResult>("/api/v1/vitals/log", body);
      setResult(res);
      loadHistory();
      if (res.severity === "severe") setTimeout(() => flagRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Only show SOS if the actual entered values are truly critical — never for normal readings
  const spo2n = spo2 ? +spo2 : null;
  const hasSevere =
    result?.flags.some((f) => f.severity === "severe") &&
    (
      (sys && +sys >= 180) ||
      (dia && +dia >= 110) ||
      (spo2n !== null && spo2n < 88) ||
      (temp && +temp >= 40.5)
    );

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Log Vitals</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Blood Pressure (mmHg)</p>
            <div className="flex items-center gap-3">
              <input type="number" placeholder="SYS" value={sys} onChange={(e) => setSys(e.target.value)}
                className="w-full text-2xl font-bold text-center border border-gray-200 rounded-xl py-3" />
              <span className="text-2xl text-gray-300">/</span>
              <input type="number" placeholder="DIA" value={dia} onChange={(e) => setDia(e.target.value)}
                className="w-full text-2xl font-bold text-center border border-gray-200 rounded-xl py-3" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-3 h-3 rounded-full ${bpDot(sys ? +sys : undefined)}`} />
              <span className="text-xs text-gray-500">
                {!sys ? "Enter reading" : +sys >= 160 ? "High" : +sys >= 140 ? "Stage 2" : +sys >= 130 ? "Elevated" : "Normal"}
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">SpO₂ / Oxygen (%)</p>
            <input type="number" placeholder="—" value={spo2} onChange={(e) => setSpo2(e.target.value)}
              className="w-full text-2xl font-bold text-center border border-gray-200 rounded-xl py-3" />
            {spo2n != null && (
              <p className={`text-xs mt-2 ${spo2n >= 95 ? "text-green-600" : "text-red-600"}`}>
                {spo2n >= 95 ? "Normal ✓" : "Low ⚠"}
              </p>
            )}
          </div>

          <button onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm text-[#0E7C66]">
            More readings <ChevronDown size={14} className={more ? "rotate-180" : ""} />
          </button>
          {more && (
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Pulse bpm" value={pulse} onChange={(e) => setPulse(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Temp °C" value={temp} onChange={(e) => setTemp(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Resp rate" value={resp} onChange={(e) => setResp(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input type="number" placeholder="Weight kg" value={weight} onChange={(e) => setWeight(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          )}

          <button onClick={submit} disabled={saving}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium disabled:opacity-60">
            {saving ? "Saving..." : "Save Vitals"}
          </button>
        </div>

        {result && (
          <div ref={flagRef} className="space-y-3">
            {hasSevere && (
              <div className="bg-red-500 text-white rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} /> Seek care now</div>
                <a href="tel:999" className="mt-2 inline-block bg-white text-red-600 font-bold px-4 py-2 rounded-xl">Call 999</a>
              </div>
            )}
            {result.flags.length === 0 ? (
              <div className="bg-green-50 text-green-700 text-sm rounded-2xl p-4">All readings look normal ✓</div>
            ) : result.flags.map((f, i) => (
              <div key={i} className={`bg-white rounded-2xl shadow-sm p-4 border-l-4 ${SEV_BORDER[f.severity] ?? "border-gray-300"}`}>
                <p className="text-sm font-semibold text-gray-800 capitalize">{f.type.replace(/_/g, " ")}</p>
                <p className="text-sm text-gray-600 mt-1">{f.message}</p>
                {f.normal_range && <p className="text-xs text-gray-400 mt-1">Normal: {f.normal_range}</p>}
              </div>
            ))}
            <button onClick={() => router.push("/dashboard/patient/saathi/report")}
              className="w-full bg-white border border-[#0E7C66] text-[#0E7C66] rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2">
              <FileText size={16} /> Generate Report
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-800">Recent readings</h2>
            <button onClick={loadTrend} className="text-sm text-[#0E7C66]">View 30-day trends →</button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No readings yet. Add your first above.</p>
          ) : (
            <div className="space-y-2">
              {history.map((v) => (
                <div key={v.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between text-sm">
                  <span className="text-gray-400 text-xs">{fmt(v.recorded_at)}</span>
                  <div className="flex items-center gap-2">
                    {v.systolic_bp && <span className="bg-[#E8F5F0] text-[#0E7C66] px-2 py-0.5 rounded-full text-xs">{v.systolic_bp}/{v.diastolic_bp ?? "—"}</span>}
                    {v.oxygen_saturation != null && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs">{v.oxygen_saturation}%</span>}
                    {v.has_flags && <AlertTriangle size={14} className="text-orange-500" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {trend && trend.data.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">Systolic BP — 30 days</p>
            <TrendChart data={trend.data} />
          </div>
        )}
      </main>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; avg: number }[] }) {
  const w = 320, h = 120, pad = 10;
  const vals = data.map((d) => d.avg);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((d.avg - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <polyline points={pts} fill="none" stroke="#0E7C66" strokeWidth="2" />
      {data.map((d, i) => {
        const x = pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((d.avg - min) / range) * (h - 2 * pad);
        return <circle key={i} cx={x} cy={y} r="2.5" fill="#0E7C66" />;
      })}
    </svg>
  );
}
