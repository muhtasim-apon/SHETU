"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { saathiGet, saathiPost, downloadWithAuth } from "@/lib/saathi";

interface Report {
  id: string; period_type: string; period_start: string; period_end: string;
  overall_risk_band?: string | null; ai_summary?: string | null;
  ai_recommendations?: string[] | null; ai_alerts?: string[] | null;
  vitals_count: number; flagged_vitals_count: number; checkins_count: number;
  avg_energy_level?: number | null; avg_sleep_hours?: number | null;
  pdf_available?: boolean; message?: string; created_at?: string | null;
}

const RISK_BG: Record<string, string> = {
  low: "bg-green-500", watch: "bg-amber-500", elevated: "bg-orange-500", urgent: "bg-red-500",
};
const STEPS = ["Fetching your vitals...", "Analyzing with AI...", "Building your report...", "Generating PDF..."];

export default function ReportPage() {
  const router = useRouter();
  const [period, setPeriod] = useState("monthly");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [lang, setLang] = useState("en");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    loadHistory();
  }, [router]);

  async function loadHistory() {
    try {
      const d = await saathiGet<{ reports: Report[] }>("/api/v1/reports/history?limit=5");
      setHistory(d.reports);
    } catch { /* ignore */ }
  }

  async function generate() {
    setLoading(true); setError(""); setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1500);
    try {
      const body = { period_type: period, language: lang, period_start: start || null, period_end: end || null };
      const r = await saathiPost<Report>("/api/v1/reports/generate", body);
      setReport(r);
      loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  async function view(id: string) {
    try { setReport(await saathiGet<Report>(`/api/v1/reports/${id}`)); } catch (e) { setError((e as Error).message); }
  }

  async function download(r: Report) {
    try {
      await downloadWithAuth(`/api/v1/reports/${r.id}/pdf`, `shetu_saathi_report_${r.period_start}_${r.period_end}.pdf`);
    } catch (e) { setError((e as Error).message); }
  }

  const band = report?.overall_risk_band ?? "low";

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Health Report</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Period</p>
            <div className="flex gap-2">
              {["weekly", "monthly", "custom"].map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`flex-1 text-sm py-2 rounded-xl capitalize ${period === p ? "bg-[#0E7C66] text-white" : "bg-gray-50 text-gray-600"}`}>{p}</button>
              ))}
            </div>
          </div>
          {period === "custom" && (
            <div className="flex gap-2">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-sm" />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-2 py-2 text-sm" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Language</p>
            <div className="flex gap-2">
              {[["en", "English"], ["bn", "বাংলা"]].map(([v, l]) => (
                <button key={v} onClick={() => setLang(v)}
                  className={`flex-1 text-sm py-2 rounded-xl ${lang === v ? "bg-[#0E7C66] text-white" : "bg-gray-50 text-gray-600"}`}>{l}</button>
              ))}
            </div>
          </div>
          <button onClick={generate} disabled={loading}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium disabled:opacity-60">
            {loading ? STEPS[step] : "Generate Report"}
          </button>
        </div>

        {report && (
          <div className="space-y-3">
            <div className={`rounded-2xl p-4 text-white text-center font-bold ${RISK_BG[band] ?? RISK_BG.low}`}>
              RISK: {band.toUpperCase()}
            </div>
            {report.message && <div className="bg-amber-50 text-amber-700 text-sm rounded-xl px-3 py-2">{report.message}</div>}
            {report.ai_summary && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">AI Summary</p>
                <p className="text-sm text-gray-600">{report.ai_summary}</p>
              </div>
            )}
            {report.ai_recommendations && report.ai_recommendations.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-800 mb-2">Recommendations</p>
                <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                  {report.ai_recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ol>
              </div>
            )}
            {report.ai_alerts && report.ai_alerts.length > 0 && (
              <div className="bg-red-50 rounded-2xl p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">⚠ Attention Required</p>
                <ul className="text-sm text-red-600 list-disc list-inside">
                  {report.ai_alerts.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div><p className="text-gray-400 text-xs">Vitals</p><p className="font-semibold">{report.vitals_count}</p></div>
              <div><p className="text-gray-400 text-xs">Avg Energy</p><p className="font-semibold">{report.avg_energy_level ?? "—"}</p></div>
              <div><p className="text-gray-400 text-xs">Avg Sleep</p><p className="font-semibold">{report.avg_sleep_hours ?? "—"}h</p></div>
            </div>
            <button onClick={() => download(report)}
              className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2">
              <Download size={16} /> Download PDF
            </button>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-2">Past Reports</h2>
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#0E7C66]" />
                    <div>
                      <p className="text-gray-700 capitalize">{r.period_type}</p>
                      <p className="text-xs text-gray-400">{r.period_start} → {r.period_end}</p>
                    </div>
                  </div>
                  <button onClick={() => view(r.id)} className="text-[#0E7C66] text-sm">View</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
