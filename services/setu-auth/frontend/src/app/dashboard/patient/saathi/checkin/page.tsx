"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { saathiGet, saathiPost } from "@/lib/saathi";

interface GoalProg { current: number; target: number; percent: number; }
interface Checkin {
  id?: string;
  overall_feeling?: string | null; energy_level?: number | null; pain_level?: number | null;
  stress_level?: number | null; sleep_hours?: number | null; sleep_quality?: number | null;
  steps_today?: number | null; exercise_minutes?: number | null; water_intake_ml?: number | null;
  had_headache?: boolean; had_fever?: boolean; had_nausea?: boolean;
  had_chest_pain?: boolean; had_dizziness?: boolean; other_symptoms?: string[]; notes?: string | null;
  goal_progress?: { steps: GoalProg; water: GoalProg; sleep: GoalProg };
  warning?: string | null;
}

const FEELINGS = [
  { v: "excellent", e: "😄" }, { v: "good", e: "🙂" }, { v: "fair", e: "😐" },
  { v: "poor", e: "😔" }, { v: "very_poor", e: "😢" },
];
const SYMPTOMS: [string, string][] = [
  ["had_headache", "Headache"], ["had_fever", "Fever"], ["had_nausea", "Nausea"],
  ["had_chest_pain", "Chest Pain"], ["had_dizziness", "Dizziness"],
];

export default function CheckinPage() {
  const router = useRouter();
  const [c, setC] = useState<Checkin>({ energy_level: 5, stress_level: 5, pain_level: 0, other_symptoms: [] });
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Checkin | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    saathiGet<Checkin | null>("/api/v1/checkin/today").then((d) => {
      if (d) { setC({ ...c, ...d }); setExisting(true); setResult(d); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const set = (k: keyof Checkin, v: unknown) => setC({ ...c, [k]: v });

  async function submit() {
    setSaving(true); setError("");
    try {
      const res = await saathiPost<Checkin>("/api/v1/checkin", c);
      setResult(res); setExisting(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const Slider = ({ label, k, min, max, accent }: { label: string; k: keyof Checkin; min: number; max: number; accent: string }) => (
    <div>
      <label className="text-sm text-gray-600 flex justify-between">
        <span>{label}</span><span className="font-semibold">{(c[k] as number) ?? min}</span>
      </label>
      <input type="range" min={min} max={max} value={(c[k] as number) ?? min}
        onChange={(e) => set(k, +e.target.value)} className={`w-full ${accent}`} />
    </div>
  );

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-28">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Daily Check-in</h1>
          <p className="text-sm text-white/60">{today}{existing ? " • already logged (editing)" : ""}</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">How do you feel?</p>
          <div className="flex justify-between">
            {FEELINGS.map((f) => (
              <button key={f.v} onClick={() => set("overall_feeling", f.v)}
                className={`text-3xl p-2 rounded-xl transition ${c.overall_feeling === f.v ? "bg-[#E8F5F0] scale-110" : "opacity-50"}`}>
                {f.e}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Slider label="Energy Level" k="energy_level" min={1} max={10} accent="accent-[#0E7C66]" />
          <Slider label="Stress Level" k="stress_level" min={1} max={10} accent="accent-orange-500" />
          <Slider label="Pain Level" k="pain_level" min={0} max={10} accent="accent-red-500" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Sleep</p>
          <div className="flex items-center gap-3">
            <input type="number" placeholder="Hours" value={c.sleep_hours ?? ""} onChange={(e) => set("sleep_hours", e.target.value ? +e.target.value : null)}
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => set("sleep_quality", s)}
                  className={`text-xl ${(c.sleep_quality ?? 0) >= s ? "text-yellow-400" : "text-gray-300"}`}>★</button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Activity</p>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" placeholder="Steps" value={c.steps_today ?? ""} onChange={(e) => set("steps_today", e.target.value ? +e.target.value : null)} className="border border-gray-200 rounded-xl px-2 py-2 text-sm" />
            <input type="number" placeholder="Exercise min" value={c.exercise_minutes ?? ""} onChange={(e) => set("exercise_minutes", e.target.value ? +e.target.value : null)} className="border border-gray-200 rounded-xl px-2 py-2 text-sm" />
            <input type="number" placeholder="Water ml" value={c.water_intake_ml ?? ""} onChange={(e) => set("water_intake_ml", e.target.value ? +e.target.value : null)} className="border border-gray-200 rounded-xl px-2 py-2 text-sm" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Symptoms</p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map(([k, label]) => (
              <button key={k} onClick={() => set(k as keyof Checkin, !c[k as keyof Checkin])}
                className={`text-sm px-3 py-1.5 rounded-full border ${c[k as keyof Checkin] ? "bg-[#0E7C66] text-white border-[#0E7C66]" : "border-gray-200 text-gray-600"}`}>
                {label}
              </button>
            ))}
          </div>
          {c.had_chest_pain && (
            <div className="mt-3 bg-orange-50 text-orange-700 text-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={15} /> If severe, call 999
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <textarea placeholder="Notes (optional)" value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" rows={3} />
        </div>

        {result?.goal_progress && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Goal progress</p>
            <ProgBar label="Steps" prog={result.goal_progress.steps} color="bg-green-500" />
            <ProgBar label="Water (ml)" prog={result.goal_progress.water} color="bg-blue-500" />
            <ProgBar label="Sleep (hrs)" prog={result.goal_progress.sleep} color="bg-purple-500" />
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto">
          <button onClick={submit} disabled={saving}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium disabled:opacity-60">
            {saving ? "Saving..." : existing ? "Update Check-in" : "Save Check-in"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgBar({ label, prog, color }: { label: string; prog: GoalProg; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{prog.current} / {prog.target} ({prog.percent}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, prog.percent)}%` }} />
      </div>
    </div>
  );
}
