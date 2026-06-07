'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, AlertTriangle, X, CheckCircle } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('shetu_token') : ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

const SEVERITY_COLORS: Record<string, string> = {
  severe: 'bg-red-50 border-red-400 text-red-800',
  elevated: 'bg-orange-50 border-orange-400 text-orange-800',
  moderate: 'bg-amber-50 border-amber-400 text-amber-800',
  mild: 'bg-yellow-50 border-yellow-300 text-yellow-800',
}

export default function VitalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [ancSummary, setAncSummary] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [flags, setFlags] = useState<any[]>([])
  const [severity, setSeverity] = useState('')
  const [showSos, setShowSos] = useState(false)
  const [toast, setToast] = useState('')
  const [expandUrine, setExpandUrine] = useState(false)
  const [expandBlood, setExpandBlood] = useState(false)
  const [expandFetal, setExpandFetal] = useState(false)
  const [expandInfection, setExpandInfection] = useState(false)

  const [form, setForm] = useState({
    systolic_bp: '', diastolic_bp: '', weight_kg: '', pulse_bpm: '', temperature_c: '',
    urine_protein: 'none', urine_glucose_positive: false,
    hemoglobin: '', blood_glucose_fasting: '', blood_glucose_1hr: '', blood_glucose_2hr: '',
    fetal_heart_rate: '', oxygen_saturation: '',
    hep_b: 'not_tested', hiv: 'not_tested', vdrl: 'not_tested',
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mother/vitals/anc-summary`, { headers: authHeaders() })
      .then(r => r.json()).then(setAncSummary).catch(() => {})
    fetch(`${API_BASE}/api/v1/mother/vitals/history?limit=5`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setHistory(d.vitals || [])).catch(() => {})
  }, [])

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const body: any = {}
    if (form.systolic_bp) body.systolic_bp = Number(form.systolic_bp)
    if (form.diastolic_bp) body.diastolic_bp = Number(form.diastolic_bp)
    if (form.weight_kg) body.weight_kg = Number(form.weight_kg)
    if (form.pulse_bpm) body.pulse_bpm = Number(form.pulse_bpm)
    if (form.temperature_c) body.temperature_c = Number(form.temperature_c)
    if (form.urine_protein && form.urine_protein !== 'none') body.urine_protein = form.urine_protein
    if (form.urine_glucose_positive) body.urine_glucose_positive = true
    if (form.hemoglobin) body.hemoglobin = Number(form.hemoglobin)
    if (form.blood_glucose_fasting) body.blood_glucose_fasting = Number(form.blood_glucose_fasting)
    if (form.blood_glucose_1hr) body.blood_glucose_1hr = Number(form.blood_glucose_1hr)
    if (form.blood_glucose_2hr) body.blood_glucose_2hr = Number(form.blood_glucose_2hr)
    if (form.fetal_heart_rate) body.fetal_heart_rate = Number(form.fetal_heart_rate)
    if (form.oxygen_saturation) body.oxygen_saturation = Number(form.oxygen_saturation)
    if (form.hep_b === 'POSITIVE') body.hep_b_surface_antigen = true
    if (form.hiv === 'POSITIVE') body.hiv_positive = true
    if (form.vdrl === 'POSITIVE') body.vdrl_positive = true

    try {
      const res = await fetch(`${API_BASE}/api/v1/mother/vitals/log`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      setFlags(data.flags || [])
      setSeverity(data.severity || '')
      if (data.requires_sos) {
        setShowSos(true)
      } else {
        setToast('✓ Vitals logged successfully')
        setTimeout(() => setToast(''), 3000)
      }
      // Refresh
      fetch(`${API_BASE}/api/v1/mother/vitals/anc-summary`, { headers: authHeaders() })
        .then(r => r.json()).then(setAncSummary).catch(() => {})
      fetch(`${API_BASE}/api/v1/mother/vitals/history?limit=5`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setHistory(d.vitals || [])).catch(() => {})
    } catch (err: any) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(''), 4000)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
  const hintClass = "text-[11px] text-gray-400 mt-0.5"
  const labelClass = "text-[13px] font-medium text-gray-700 mb-1"
  const sectionClass = "bg-white rounded-2xl shadow-sm p-4 mb-3"

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-10 pb-4 px-5">
        <button onClick={() => router.push('/dashboard/mother/saathi')}
          className="flex items-center gap-1 text-white/70 text-sm mb-2">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-[22px] font-bold text-white">Log Maternal Vitals</h1>
        <p className="text-[13px] text-white/70">ANC Monitoring</p>
        {ancSummary?.blood_pressure?.latest_systolic && (
          <p className="text-[12px] text-white/60 mt-1">
            Last BP: {ancSummary.blood_pressure.latest_systolic}/{ancSummary.blood_pressure.latest_diastolic} mmHg
          </p>
        )}
      </div>

      <div className="px-4 pt-4">
        {/* ANC Summary card */}
        {ancSummary && (
          <div className="border border-teal-200 bg-teal-50 rounded-2xl p-4 mb-4">
            <p className="text-[13px] font-semibold text-teal-800 mb-2">ANC Summary (Last 30 days)</p>
            <div className="grid grid-cols-2 gap-2 text-[12px] text-teal-700">
              {ancSummary.blood_pressure?.latest_systolic && (
                <span>BP: {ancSummary.blood_pressure.latest_systolic}/{ancSummary.blood_pressure.latest_diastolic}</span>
              )}
              {ancSummary.weight?.latest_kg && (
                <span>Weight: {ancSummary.weight.latest_kg} kg</span>
              )}
              {ancSummary.blood_tests?.latest_hemoglobin && (
                <span>Hb: {ancSummary.blood_tests.latest_hemoglobin} g/dL</span>
              )}
              {ancSummary.fetal?.latest_fhr && (
                <span>FHR: {ancSummary.fetal.latest_fhr} bpm</span>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="flex items-center gap-2 bg-teal-600 text-white text-sm px-4 py-3 rounded-xl mb-3">
            <CheckCircle size={16} /> {toast}
            {toast.includes('Report') ? null : (
              <button onClick={() => router.push('/dashboard/mother/saathi/report')}
                className="ml-auto underline text-xs">Generate Report</button>
            )}
          </div>
        )}

        {/* Flag banners */}
        {flags.filter(f => f.type !== 'extra_screenings').map((f, i) => (
          <div key={i} className={`border-l-4 rounded-xl px-3 py-2 mb-2 text-sm ${SEVERITY_COLORS[f.severity] || 'bg-gray-50 border-gray-300'}`}>
            {f.message}
          </div>
        ))}

        <form onSubmit={handleSubmit}>
          {/* Core ANC Vitals */}
          <div className={sectionClass}>
            <p className="text-[14px] font-semibold text-gray-800 mb-3">Core ANC Vitals</p>
            <div className="mb-3">
              <p className={labelClass}>Blood Pressure</p>
              <div className="flex gap-2">
                <input className={inputClass} type="number" placeholder="Systolic"
                  value={form.systolic_bp} onChange={e => set('systolic_bp', e.target.value)} />
                <input className={inputClass} type="number" placeholder="Diastolic"
                  value={form.diastolic_bp} onChange={e => set('diastolic_bp', e.target.value)} />
              </div>
              <p className={hintClass}>mmHg · hint: &lt;140/90 in pregnancy</p>
            </div>
            <div className="mb-3">
              <p className={labelClass}>Weight (kg)</p>
              <input className={inputClass} type="number" step="0.1" placeholder="e.g. 62.5"
                value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} />
            </div>
            <div className="mb-3">
              <p className={labelClass}>Pulse (bpm)</p>
              <input className={inputClass} type="number" placeholder="e.g. 80"
                value={form.pulse_bpm} onChange={e => set('pulse_bpm', e.target.value)} />
            </div>
            <div>
              <p className={labelClass}>Temperature (°C)</p>
              <input className={inputClass} type="number" step="0.1" placeholder="e.g. 36.8"
                value={form.temperature_c} onChange={e => set('temperature_c', e.target.value)} />
            </div>
          </div>

          {/* Urine Analysis */}
          <div className={sectionClass}>
            <button type="button" onClick={() => setExpandUrine(!expandUrine)}
              className="flex items-center justify-between w-full">
              <p className="text-[14px] font-semibold text-gray-800">Urine Analysis</p>
              {expandUrine ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {expandUrine && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className={labelClass}>Urine Protein</p>
                  <select className={inputClass} value={form.urine_protein} onChange={e => set('urine_protein', e.target.value)}>
                    {['none', 'trace', '1+', '2+', '3+', '4+'].map(v => <option key={v}>{v}</option>)}
                  </select>
                  <p className={hintClass}>Pre-eclampsia screen</p>
                </div>
                <div>
                  <p className={labelClass}>Urine Glucose</p>
                  <div className="flex gap-3">
                    {['No', 'Yes'].map(v => (
                      <button type="button" key={v}
                        onClick={() => set('urine_glucose_positive', v === 'Yes')}
                        className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${form.urine_glucose_positive === (v === 'Yes') ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className={hintClass}>May indicate GDM</p>
                </div>
              </div>
            )}
          </div>

          {/* Blood Tests */}
          <div className={sectionClass}>
            <button type="button" onClick={() => setExpandBlood(!expandBlood)}
              className="flex items-center justify-between w-full">
              <p className="text-[14px] font-semibold text-gray-800">Blood Tests</p>
              {expandBlood ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {expandBlood && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className={labelClass}>Haemoglobin (g/dL)</p>
                  <input className={inputClass} type="number" step="0.1" placeholder="e.g. 11.5"
                    value={form.hemoglobin} onChange={e => set('hemoglobin', e.target.value)} />
                  <p className={hintClass}>≥11 normal in pregnancy</p>
                </div>
                <div>
                  <p className={labelClass}>Fasting Glucose (mg/dL)</p>
                  <input className={inputClass} type="number" placeholder="e.g. 88"
                    value={form.blood_glucose_fasting} onChange={e => set('blood_glucose_fasting', e.target.value)} />
                  <p className={hintClass}>GDM threshold &lt;92 mg/dL</p>
                </div>
                <div>
                  <p className={labelClass}>1-hr OGTT (mg/dL)</p>
                  <input className={inputClass} type="number" placeholder="e.g. 140"
                    value={form.blood_glucose_1hr} onChange={e => set('blood_glucose_1hr', e.target.value)} />
                  <p className={hintClass}>&lt;180 normal</p>
                </div>
                <div>
                  <p className={labelClass}>2-hr OGTT (mg/dL)</p>
                  <input className={inputClass} type="number" placeholder="e.g. 130"
                    value={form.blood_glucose_2hr} onChange={e => set('blood_glucose_2hr', e.target.value)} />
                  <p className={hintClass}>&lt;153 normal</p>
                </div>
              </div>
            )}
          </div>

          {/* Fetal Monitoring */}
          <div className={sectionClass}>
            <button type="button" onClick={() => setExpandFetal(!expandFetal)}
              className="flex items-center justify-between w-full">
              <p className="text-[14px] font-semibold text-gray-800">Fetal Monitoring</p>
              {expandFetal ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {expandFetal && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className={labelClass}>Fetal Heart Rate (bpm)</p>
                  <input className={inputClass} type="number" placeholder="e.g. 140"
                    value={form.fetal_heart_rate} onChange={e => set('fetal_heart_rate', e.target.value)} />
                  <p className={hintClass}>120-160 bpm normal</p>
                </div>
                <div>
                  <p className={labelClass}>SpO2 (%)</p>
                  <input className={inputClass} type="number" step="0.1" placeholder="e.g. 98"
                    value={form.oxygen_saturation} onChange={e => set('oxygen_saturation', e.target.value)} />
                  <p className={hintClass}>95-100% normal</p>
                </div>
              </div>
            )}
          </div>

          {/* Infection Screening */}
          <div className={`${sectionClass} border border-red-100`}>
            <button type="button" onClick={() => setExpandInfection(!expandInfection)}
              className="flex items-center justify-between w-full">
              <p className="text-[14px] font-semibold text-gray-800">Infection Screening</p>
              {expandInfection ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {expandInfection && (
              <div className="mt-3 space-y-3">
                <p className="text-[12px] text-gray-500">Record one-time test results from your doctor</p>
                {[
                  { label: 'HBsAg (Hepatitis B)', key: 'hep_b' },
                  { label: 'HIV', key: 'hiv' },
                  { label: 'Syphilis (VDRL)', key: 'vdrl' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <p className={labelClass}>{label}</p>
                    <select className={inputClass} value={(form as any)[key]}
                      onChange={e => set(key, e.target.value)}>
                      <option value="not_tested">Not tested</option>
                      <option value="Negative">Negative</option>
                      <option value="POSITIVE">POSITIVE</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-[#0E7C66] text-white font-semibold py-3.5 rounded-2xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5" /> : null}
            {loading ? 'Saving...' : 'Log Vitals'}
          </button>
        </form>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] font-semibold text-gray-700 mb-2">Recent Readings</p>
            {history.map((v: any) => (
              <div key={v.id} className="bg-white rounded-xl p-3 mb-2 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[12px] text-gray-500">{v.recorded_at?.slice(0, 10)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {v.systolic_bp && <span className="bg-teal-50 text-teal-700 text-[11px] px-2 py-0.5 rounded-full">
                      {v.systolic_bp}/{v.diastolic_bp}
                    </span>}
                    {v.weight_kg && <span className="bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
                      {v.weight_kg}kg
                    </span>}
                    {v.hemoglobin && <span className="bg-purple-50 text-purple-700 text-[11px] px-2 py-0.5 rounded-full">
                      Hb {v.hemoglobin}
                    </span>}
                    {v.fetal_heart_rate && <span className="bg-pink-50 text-pink-700 text-[11px] px-2 py-0.5 rounded-full">
                      FHR {v.fetal_heart_rate}
                    </span>}
                  </div>
                </div>
                {v.has_flags && <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SOS Modal */}
      {showSos && (
        <div className="fixed inset-0 bg-red-900/95 z-50 flex flex-col items-center justify-center p-6">
          <AlertTriangle size={56} className="text-white mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">⚠ DANGER SIGN DETECTED</h2>
          <p className="text-white/80 text-center mb-4">Severe vitals detected. Please seek immediate medical attention.</p>
          <div className="w-full space-y-2 mb-4">
            {flags.filter(f => f.severity === 'severe' && f.type !== 'extra_screenings').map((f, i) => (
              <div key={i} className="bg-red-800 rounded-xl px-4 py-3 text-white text-sm">{f.message}</div>
            ))}
          </div>
          <a href="tel:999"
            className="w-full bg-white text-red-700 font-bold py-4 rounded-2xl text-center text-[17px] mb-3">
            📞 Call 999 Now
          </a>
          <button onClick={() => router.push('/dashboard/mother/pregnancy/sos')}
            className="w-full bg-red-600 text-white font-semibold py-3.5 rounded-2xl text-center mb-3">
            Use SOS
          </button>
          <button onClick={() => setShowSos(false)}
            className="text-white/60 text-sm underline">Dismiss</button>
        </div>
      )}

      <BottomNav activeTab="home" />
    </div>
  )
}
