"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Check, Trash2, X } from "lucide-react";
import { saathiGet, saathiPost, saathiDelete } from "@/lib/saathi";

interface Goal {
  id: string; goal_type: string; goal_label: string; target_value: number;
  target_unit: string; current_value?: number | null; progress_percent: number;
  is_active: boolean; is_achieved: boolean; deadline?: string | null; days_remaining?: number | null;
}

const TYPES = [
  { v: "daily_steps", label: "Steps", icon: "🦶", unit: "steps", target: 8000 },
  { v: "weight_loss", label: "Weight", icon: "⚖", unit: "kg", target: 70 },
  { v: "blood_pressure", label: "BP", icon: "❤", unit: "mmHg", target: 120 },
  { v: "blood_glucose", label: "Glucose", icon: "🩸", unit: "mg/dL", target: 100 },
  { v: "exercise_minutes", label: "Exercise", icon: "🏃", unit: "minutes", target: 30 },
  { v: "water_intake", label: "Water", icon: "💧", unit: "litres", target: 2 },
  { v: "sleep_hours", label: "Sleep", icon: "😴", unit: "hours", target: 7.5 },
];

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ goal_type: "daily_steps", goal_label: "Daily Steps", target_value: 8000, target_unit: "steps", deadline: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    load();
  }, [router]);

  async function load() {
    try {
      const data = await saathiGet<{ goals: Goal[] }>("/api/v1/goals");
      setGoals(data.goals);
    } catch (e) { setError((e as Error).message); }
  }

  function pickType(t: typeof TYPES[number]) {
    setForm({ goal_type: t.v, goal_label: t.label + " Goal", target_value: t.target, target_unit: t.unit, deadline: "" });
  }

  async function create() {
    setError("");
    try {
      await saathiPost("/api/v1/goals", { ...form, deadline: form.deadline || null });
      setShowModal(false);
      load();
    } catch (e) { setError((e as Error).message); }
  }

  async function achieve(id: string) {
    await saathiPost(`/api/v1/goals/${id}/achieve`);
    load();
  }
  async function deactivate(id: string) {
    await saathiDelete(`/api/v1/goals/${id}`);
    load();
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
              <ChevronLeft size={16} /> Back
            </button>
            <h1 className="text-xl font-bold mt-2">My Health Goals</h1>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-white/15 hover:bg-white/25 rounded-full p-2.5">
            <Plus size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}
        {goals.length === 0 && <p className="text-sm text-gray-400 text-center mt-8">No goals yet. Tap + to add one.</p>}
        {goals.map((g) => (
          <div key={g.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-800">{g.goal_label}</p>
              <div className="flex items-center gap-2">
                {g.is_achieved ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Achieved ✓</span>
                ) : (
                  <>
                    <button onClick={() => achieve(g.id)} className="text-green-600"><Check size={16} /></button>
                    <button onClick={() => deactivate(g.id)} className="text-gray-400"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span className="bg-gray-100 px-2 py-0.5 rounded-full">{g.goal_type.replace(/_/g, " ")}</span>
              {g.deadline && <span>{g.days_remaining != null ? `${g.days_remaining}d left` : g.deadline}</span>}
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#0E7C66]" style={{ width: `${Math.min(100, g.progress_percent)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {g.current_value ?? "—"} / {g.target_value} {g.target_unit} ({g.progress_percent.toFixed(0)}%)
            </p>
          </div>
        ))}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">New Goal</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => (
                <button key={t.v} onClick={() => pickType(t)}
                  className={`rounded-xl py-3 text-center ${form.goal_type === t.v ? "bg-[#E8F5F0] ring-2 ring-[#0E7C66]" : "bg-gray-50"}`}>
                  <div className="text-xl">{t.icon}</div>
                  <div className="text-[10px] text-gray-600 mt-1">{t.label}</div>
                </button>
              ))}
            </div>
            <input value={form.goal_label} onChange={(e) => setForm({ ...form, goal_label: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Goal label" />
            <div className="flex gap-3">
              <input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: +e.target.value })}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Target" />
              <input value={form.target_unit} onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Unit" />
            </div>
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <button onClick={create} className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium">Create Goal</button>
          </div>
        </div>
      )}
    </div>
  );
}
