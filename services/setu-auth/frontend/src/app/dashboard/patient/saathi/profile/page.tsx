"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { saathiGet, saathiPost } from "@/lib/saathi";

interface Profile {
  exists?: boolean;
  height_cm?: number | null;
  weight_kg?: number | null;
  blood_group?: string | null;
  activity_level?: string | null;
  is_smoker?: boolean;
  is_diabetic?: boolean;
  is_hypertensive?: boolean;
  has_heart_disease?: boolean;
  has_kidney_disease?: boolean;
  other_conditions?: string[];
  known_allergies?: string[];
  current_medications?: string[];
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  daily_step_target?: number;
  daily_water_ml?: number;
  sleep_target_hours?: number;
  bmi?: number | null;
}

const ACTIVITY = ["sedentary", "lightly_active", "moderately_active", "very_active", "athlete"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

// Must be outside ProfilePage to avoid remount-on-every-render
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

function ChipInput({ label, items, setItems }: { label: string; items: string[]; setItems: (v: string[]) => void }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {items.map((c, i) => (
          <span key={i} className="text-xs bg-[#E8F5F0] text-[#0E7C66] px-2 py-1 rounded-full flex items-center gap-1">
            {c}
            <button onClick={() => setItems(items.filter((_, j) => j !== i))}><X size={12} /></button>
          </span>
        ))}
      </div>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) {
            e.preventDefault();
            setItems([...items, val.trim()]);
            setVal("");
          }
        }}
        placeholder="Type and press Enter"
        className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile>({
    is_smoker: false, is_diabetic: false, is_hypertensive: false,
    has_heart_disease: false, has_kidney_disease: false,
    other_conditions: [], known_allergies: [], current_medications: [],
    daily_step_target: 8000, daily_water_ml: 2000, sleep_target_hours: 7.5,
  });
  const [saving, setSaving] = useState(false);
  const [savedBmi, setSavedBmi] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    saathiGet<Profile>("/api/v1/profile").then((data) => {
      if (data) setP((prev) => ({ ...prev, ...data }));
    }).catch(() => {});
  }, [router]);

  const liveBmi = p.height_cm && p.weight_kg
    ? p.weight_kg / Math.pow(p.height_cm / 100, 2) : null;

  async function submit() {
    setSaving(true); setError("");
    try {
      const res = await saathiPost<Profile>("/api/v1/profile", p);
      setSavedBmi(res.bmi ?? liveBmi ?? null);
      setToast("Profile saved!");
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const toggle = (k: keyof Profile) => setP((prev) => ({ ...prev, [k]: !prev[k] }));
  const set = (k: keyof Profile, v: unknown) => setP((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-28">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/health-assistant")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Health Profile</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

        <Section title="Basic Info">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-600">Height (cm)</label>
              <input type="number" value={p.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value ? +e.target.value : null)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Weight (kg)</label>
              <input type="number" value={p.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value ? +e.target.value : null)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Blood group</label>
            <select value={p.blood_group ?? ""} onChange={(e) => set("blood_group", e.target.value || null)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Select</option>
              {BLOOD.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          {liveBmi && (
            <p className="text-sm text-[#0E7C66]">
              BMI: <b>{liveBmi.toFixed(1)}</b> ({bmiCategory(liveBmi)})
            </p>
          )}
        </Section>

        <Section title="Lifestyle">
          <div>
            <label className="text-sm text-gray-600">Activity level</label>
            <select value={p.activity_level ?? ""} onChange={(e) => set("activity_level", e.target.value || null)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Select</option>
              {ACTIVITY.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          {([
            ["is_smoker", "Smoker"], ["is_diabetic", "Diabetic"],
            ["is_hypertensive", "Hypertensive"], ["has_heart_disease", "Heart disease"],
            ["has_kidney_disease", "Kidney disease"],
          ] as [keyof Profile, string][]).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between text-sm py-1">
              <span className="text-gray-700">{label}</span>
              <button onClick={() => toggle(k)}
                className={`w-11 h-6 rounded-full transition ${p[k] ? "bg-[#0E7C66]" : "bg-gray-200"}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${p[k] ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </label>
          ))}
        </Section>

        <Section title="Other Conditions">
          <ChipInput label="Other conditions" items={p.other_conditions ?? []} setItems={(v) => set("other_conditions", v)} />
          <ChipInput label="Known allergies" items={p.known_allergies ?? []} setItems={(v) => set("known_allergies", v)} />
          <ChipInput label="Current medications" items={p.current_medications ?? []} setItems={(v) => set("current_medications", v)} />
        </Section>

        <Section title="Daily Targets">
          <div>
            <label className="text-sm text-gray-600">Step goal: {p.daily_step_target}</label>
            <input type="range" min={5000} max={15000} step={500} value={p.daily_step_target}
              onChange={(e) => set("daily_step_target", +e.target.value)} className="w-full accent-[#0E7C66]" />
          </div>
          <div>
            <label className="text-sm text-gray-600">Water: {p.daily_water_ml} ml</label>
            <input type="range" min={1000} max={4000} step={100} value={p.daily_water_ml}
              onChange={(e) => set("daily_water_ml", +e.target.value)} className="w-full accent-[#0E7C66]" />
          </div>
          <div>
            <label className="text-sm text-gray-600">Sleep: {p.sleep_target_hours} hrs</label>
            <input type="range" min={6} max={10} step={0.5} value={p.sleep_target_hours}
              onChange={(e) => set("sleep_target_hours", +e.target.value)} className="w-full accent-[#0E7C66]" />
          </div>
        </Section>

        <Section title="Emergency Contact">
          <input placeholder="Name" value={p.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input placeholder="Phone" value={p.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input placeholder="Relation" value={p.emergency_contact_relation ?? ""} onChange={(e) => set("emergency_contact_relation", e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </Section>

        {savedBmi != null && (
          <div className="bg-[#E8F5F0] text-[#0E7C66] text-sm rounded-2xl px-4 py-3 text-center font-medium">
            Saved • BMI {savedBmi.toFixed(1)} — {bmiCategory(savedBmi)}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto">
          <button onClick={submit} disabled={saving}
            className="w-full bg-[#0E7C66] text-white rounded-xl py-3 font-medium disabled:opacity-60">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 inset-x-0 flex justify-center">
          <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-full">{toast}</div>
        </div>
      )}
    </div>
  );
}
