'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle, Download, RefreshCw, Upload, Stethoscope, Video } from 'lucide-react'
import type { RiskProfile, QAAnswer, RiskReport } from '@/lib/risk-prediction'
import { getFilteredQuestions } from '@/lib/risk-prediction'
import { sendRiskPrediction, analyseLabReport } from '@/lib/gemini'
import type { LabReportAnalysis } from '@/lib/gemini'
import { saveRiskAssessment, fetchDoctorsBySpecialty } from '@/lib/drishti-db'
import type { ClinicianRow } from '@/lib/drishti-db'
import { generateDrishtiPdf } from '@/lib/drishti-pdf'

const DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh']
const CONDITIONS = ['Diabetes', 'Hypertension', 'Anaemia', 'Gestational Diabetes', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'None']

const BAND_META: Record<string, { label: string; pill: string; bar: string; border: string }> = {
  low:      { label: 'Low Risk',      pill: 'bg-green-500/20 text-green-300 border-green-500/40',   bar: 'bg-green-500',  border: 'border-green-500/30' },
  watch:    { label: 'Watch',         pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40',   bar: 'bg-amber-500',  border: 'border-amber-500/40' },
  elevated: { label: 'Elevated Risk', pill: 'bg-orange-500/20 text-orange-300 border-orange-500/40', bar: 'bg-orange-500', border: 'border-orange-500/40' },
  urgent:   { label: 'URGENT',        pill: 'bg-red-500/20 text-red-300 border-red-500/40',         bar: 'bg-red-500',    border: 'border-red-500/50' },
}

const FLAG_ICONS: Record<string, string> = {
  low: '🟡', medium: '🟠', high: '🔴',
}

const CONDITION_SPECIALTY_MAP: Record<string, string[]> = {
  'Diabetes': ['diabetes', 'endocrinology', 'medicine'],
  'Hypertension': ['cardiology', 'medicine', 'internal'],
  'Anaemia': ['haematology', 'medicine', 'gynaecology'],
  'Heart Disease': ['cardiology', 'cardiac'],
  'Kidney Disease': ['nephrology', 'urology'],
  'Thyroid': ['endocrinology', 'medicine'],
  'Preeclampsia': ['gynaecology', 'obstetrics', 'maternal'],
  'Gestational Diabetes': ['gynaecology', 'obstetrics', 'diabetes'],
  'Miscarriage': ['gynaecology', 'obstetrics'],
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 justify-center py-8">
      <style>{`
        @keyframes bd { 0%,80%,100%{transform:scale(0);opacity:.3}40%{transform:scale(1);opacity:1} }
        .bd{animation:bd 1.4s infinite ease-in-out}
        .bd:nth-child(1){animation-delay:-.32s}.bd:nth-child(2){animation-delay:-.16s}
      `}</style>
      <div className="bd w-3 h-3 rounded-full bg-[#0E7C66]" />
      <div className="bd w-3 h-3 rounded-full bg-[#0E7C66]" />
      <div className="bd w-3 h-3 rounded-full bg-[#0E7C66]" />
    </div>
  )
}

export default function RiskPrediction({ dashboardType }: { dashboardType: 'mother' | 'patient' }) {
  const router = useRouter()
  const [phase, setPhase] = useState<1 | 2 | 3>(1)

  const [profile, setProfile] = useState<Partial<RiskProfile>>({ gender: 'female', pregnant: false, conditions: [] })
  const [fileBase64, setFileBase64] = useState<string | undefined>()
  const [fileMimeType, setFileMimeType] = useState<string | undefined>()
  const [fileUploaded, setFileUploaded] = useState(false)
  const [labAnalysis, setLabAnalysis] = useState<LabReportAnalysis | null>(null)
  const [labLoading, setLabLoading] = useState(false)
  const [labError, setLabError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [answers, setAnswers] = useState<QAAnswer[]>([])
  const [currentQIdx, setCurrentQIdx] = useState(0)

  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<ClinicianRow[]>([])

  const bmi = profile.weight_kg && profile.height_cm
    ? profile.weight_kg / Math.pow(profile.height_cm / 100, 2)
    : null

  const bmiLabel = bmi
    ? bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'
    : ''

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setFileBase64(base64)
      setFileMimeType(file.type)
      setFileUploaded(true)
      setLabLoading(true)
      setLabError(null)
      try {
        const analysis = await analyseLabReport(base64, file.type)
        setLabAnalysis(analysis)
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Lab analysis failed')
      } finally {
        setLabLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const toggleCondition = (c: string) => {
    setProfile((prev) => {
      const current = prev.conditions ?? []
      if (c === 'None') return { ...prev, conditions: ['None'] }
      const without = current.filter((x) => x !== 'None')
      return { ...prev, conditions: without.includes(c) ? without.filter((x) => x !== c) : [...without, c] }
    })
  }

  const startAssessment = () => {
    const full: RiskProfile = {
      gender: profile.gender ?? 'female',
      pregnant: profile.pregnant ?? false,
      age: profile.age ?? 25,
      weight_kg: profile.weight_kg ?? 60,
      height_cm: profile.height_cm ?? 160,
      bmi: bmi ?? 23,
      division: profile.division ?? 'Dhaka',
      conditions: profile.conditions ?? [],
    }
    sessionStorage.setItem('shetu_profile', JSON.stringify(full))
    setCurrentQIdx(0)
    setAnswers([])
    setPhase(2)
  }

  const questions = getFilteredQuestions({
    gender: profile.gender ?? 'female',
    pregnant: profile.pregnant ?? false,
    age: profile.age ?? 25,
    weight_kg: profile.weight_kg ?? 60,
    height_cm: profile.height_cm ?? 160,
    bmi: bmi ?? 23,
    division: profile.division ?? 'Dhaka',
    conditions: profile.conditions ?? [],
  })

  const runAnalysis = useCallback(async (finalAnswers: QAAnswer[]) => {
    setPhase(3)
    setLoading(true)
    setError(null)
    setDoctors([])
    try {
      const stored = sessionStorage.getItem('shetu_profile')
      const p: RiskProfile = stored ? JSON.parse(stored) : {} as RiskProfile
      const result = await sendRiskPrediction(p, finalAnswers, fileBase64, fileMimeType)
      setReport(result)

      await saveRiskAssessment(p, finalAnswers, result, labAnalysis)

      if (result.overall_band === 'elevated' || result.overall_band === 'urgent' || result.specialist_needed) {
        const topConditionNames = result.conditions.slice(0, 3).map((c) => c.name)
        const specialties = topConditionNames.flatMap((n) => {
          const key = Object.keys(CONDITION_SPECIALTY_MAP).find((k) => n.toLowerCase().includes(k.toLowerCase()))
          return key ? CONDITION_SPECIALTY_MAP[key] : []
        })
        if (specialties.length > 0) {
          const docs = await fetchDoctorsBySpecialty(specialties)
          setDoctors(docs)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [fileBase64, fileMimeType])

  const handleAnswer = useCallback(async (q: typeof questions[0], optKey: string) => {
    const opt = q.options.find((o) => o.key === optKey)!
    const newAnswers = [...answers, { questionId: q.id, answer: optKey, label: opt.label }]
    setAnswers(newAnswers)
    if (currentQIdx + 1 >= questions.length) {
      await runAnalysis(newAnswers)
    } else {
      setCurrentQIdx((i) => i + 1)
    }
  }, [answers, currentQIdx, questions, runAnalysis])

  const retry = () => runAnalysis(answers)

  const downloadReport = () => {
    if (!report) return
    const stored = sessionStorage.getItem('shetu_profile')
    const p: RiskProfile = stored ? JSON.parse(stored) : profile as RiskProfile
    generateDrishtiPdf(p, answers, report, labAnalysis)
  }

  const reset = () => {
    setPhase(1); setAnswers([]); setCurrentQIdx(0); setReport(null); setError(null)
    setFileUploaded(false); setFileBase64(undefined); setFileMimeType(undefined)
    setLabAnalysis(null); setLabError(null); setDoctors([])
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] text-gray-800">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-12 pb-8 px-5">
        <button
          onClick={() => router.push(`/dashboard/${dashboardType}`)}
          className="flex items-center gap-1 text-white/70 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Dashboard
        </button>
        <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU DRISHTI</p>
        <h1 className="text-[26px] font-bold text-white mt-1">Risk Assessment</h1>
        <p className="text-[14px] text-white/70 mt-0.5">Early-warning clinical decision engine</p>

        {/* Phase stepper */}
        <div className="flex items-center gap-2 mt-5">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${phase >= s ? 'bg-white text-[#0E7C66]' : 'bg-white/20 text-white/50'}`}>{s}</div>
              {s < 3 && <div className={`h-0.5 w-8 ${phase > s ? 'bg-white' : 'bg-white/20'}`} />}
            </div>
          ))}
          <span className="ml-2 text-white/70 text-xs">{phase === 1 ? 'Profile' : phase === 2 ? 'Symptoms' : 'Report'}</span>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">

        {/* ── PHASE 1 ── */}
        {phase === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-700">Patient Profile</h2>

              <div className="space-y-1">
                <label className="text-xs text-gray-500">Gender</label>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value as RiskProfile['gender'], pregnant: false }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66] focus:ring-1 focus:ring-[#0E7C66]"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="third-gender">Third-gender</option>
                </select>
              </div>

              {profile.gender === 'female' && (
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">Are you pregnant?</label>
                  <div className="flex gap-3">
                    {['Yes', 'No'].map((v) => (
                      <button
                        key={v}
                        onClick={() => setProfile((p) => ({ ...p, pregnant: v === 'Yes' }))}
                        className={`flex-1 py-2 rounded-xl text-sm border transition-all font-medium ${
                          (v === 'Yes') === profile.pregnant
                            ? 'bg-[#0E7C66] border-[#0E7C66] text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-[#0E7C66]/40'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Age', key: 'age', min: 1, max: 120, placeholder: 'yrs' },
                  { label: 'Weight (kg)', key: 'weight_kg', min: 10, max: 300, placeholder: 'kg' },
                  { label: 'Height (cm)', key: 'height_cm', min: 50, max: 250, placeholder: 'cm' },
                ].map(({ label, key, min, max, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-gray-500">{label}</label>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      placeholder={placeholder}
                      value={(profile as Record<string, unknown>)[key] as number ?? ''}
                      onChange={(e) => setProfile((p) => ({ ...p, [key]: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66] focus:ring-1 focus:ring-[#0E7C66]"
                    />
                  </div>
                ))}
              </div>

              {bmi && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-gray-500">BMI</span>
                  <span className="font-semibold text-teal-700">{bmi.toFixed(1)} — {bmiLabel}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-gray-500">Division</label>
                <select
                  value={profile.division ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, division: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66] focus:ring-1 focus:ring-[#0E7C66]"
                >
                  <option value="">Select division</option>
                  {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500">Known Conditions</label>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((c) => {
                    const selected = profile.conditions?.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCondition(c)}
                        className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-all ${
                          selected
                            ? 'bg-[#0E7C66] border-[#0E7C66] text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-[#0E7C66]/50'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Lab report upload */}
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Lab Report (optional)</h3>
                <span className="text-xs text-gray-400">PDF or image — AI extracted</span>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-[#0E7C66] hover:text-[#0E7C66] transition-all"
              >
                <Upload size={16} />
                Choose file (.pdf / .jpg / .png)
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />

              {fileUploaded && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <CheckCircle size={14} />
                  Report uploaded ✓ — AI analysis running...
                </div>
              )}

              {labLoading && (
                <div className="text-xs text-gray-500 flex items-center gap-2"><LoadingDots /></div>
              )}

              {labError && (
                <div className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{labError}</div>
              )}

              {labAnalysis && (
                <div className="space-y-3 mt-1">
                  <p className="text-xs font-semibold text-gray-600">AI Lab Analysis Preview</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{labAnalysis.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {labAnalysis.extracted_values.map((v) => (
                      <span
                        key={v.name}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          v.status === 'critical' ? 'bg-red-50 border-red-300 text-red-700'
                          : v.status === 'abnormal' ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-green-50 border-green-300 text-green-700'
                        }`}
                      >
                        {v.name}: {v.value} {v.unit}
                      </span>
                    ))}
                  </div>
                  {labAnalysis.flags.length > 0 && (
                    <div className="space-y-1.5">
                      {labAnalysis.flags.map((f, i) => (
                        <div key={i} className="text-xs flex items-start gap-2 text-gray-600">
                          <span>{FLAG_ICONS[f.severity]}</span>
                          <span><strong>{f.marker}:</strong> {f.concern}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={startAssessment}
              disabled={!profile.division || !profile.age || !profile.weight_kg || !profile.height_cm}
              className="w-full py-3.5 rounded-2xl bg-[#0E7C66] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0c6b57] transition-colors shadow-sm"
            >
              Start Symptom Assessment →
            </button>
          </div>
        )}

        {/* ── PHASE 2 ── */}
        {phase === 2 && (() => {
          const q = questions[currentQIdx]
          const progress = Math.round((currentQIdx / questions.length) * 100)
          return (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Question {currentQIdx + 1} of {questions.length}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#0E7C66] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-gray-800 font-semibold text-[16px] leading-relaxed">{q.text}</p>
              </div>

              <div className="space-y-3">
                {q.options.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleAnswer(q, opt.key)}
                    className="w-full flex items-center gap-4 p-4 bg-white hover:bg-teal-50 border border-gray-200 hover:border-[#0E7C66] rounded-2xl text-left transition-all shadow-sm"
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#0E7C66]/10 flex items-center justify-center text-sm font-bold text-[#0E7C66] shrink-0">
                      {opt.key}
                    </span>
                    <span className="text-sm text-gray-700 font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── PHASE 3 ── */}
        {phase === 3 && (
          <div className="space-y-4">
            {loading && (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <p className="text-gray-500 text-sm mb-2">Analysing your responses...</p>
                <LoadingDots />
              </div>
            )}

            {error && !loading && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle size={18} />
                  <span className="font-semibold text-sm">Analysis failed</span>
                </div>
                <p className="text-sm text-red-600/80">{error}</p>
                <button onClick={retry} className="flex items-center gap-2 text-sm text-[#0E7C66] font-medium">
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            )}

            {report && !loading && (
              <>
                {/* Overall band card */}
                {(() => {
                  const meta = BAND_META[report.overall_band]
                  return (
                    <div className={`bg-white rounded-2xl shadow-sm p-5 border-2 ${meta.border} ${report.overall_band === 'urgent' ? 'animate-pulse-border' : ''}`}>
                      <style>{`
                        @keyframes pulse-border {0%,100%{border-color:rgba(239,68,68,.5)}50%{border-color:rgba(239,68,68,1)}}
                        .animate-pulse-border{animation:pulse-border 1.5s ease-in-out infinite}
                      `}</style>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="font-bold text-gray-800">Overall Risk</h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wide ${meta.pill}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-sm font-semibold text-gray-800">{report.next_action}</p>
                        <p className="text-xs text-gray-500 mt-1">⏱ {report.timeframe}</p>
                      </div>
                    </div>
                  )
                })()}

                {/* CHW alert */}
                {report.overall_band === 'urgent' && (
                  <div className="bg-red-50 border border-red-300 rounded-2xl px-5 py-3 flex items-center gap-3">
                    <AlertTriangle size={18} className="text-red-500 shrink-0" />
                    <p className="text-sm text-red-700 font-semibold">Alert sent to your care worker</p>
                  </div>
                )}

                {/* Specialist recommended */}
                {report.specialist_needed && (
                  <div className="bg-teal-50 border border-teal-300 rounded-2xl px-5 py-3 flex items-center gap-3">
                    <CheckCircle size={18} className="text-teal-600 shrink-0" />
                    <p className="text-sm text-teal-700 font-semibold">Shetu specialist review recommended</p>
                  </div>
                )}

                {/* Conditions */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">Identified Conditions</h3>
                  {report.conditions.map((c) => {
                    const meta = BAND_META[c.band]
                    return (
                      <div key={c.name} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800 text-sm">{c.name}</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs border font-medium ${meta.pill}`}>{c.band}</span>
                        </div>

                        {/* Probability bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>Probability</span>
                            <span className="font-semibold text-gray-700">{c.probability}%</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${c.probability}%` }} />
                          </div>
                        </div>

                        {/* Severity flag */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Severity flag:</span>
                          <span>{c.band === 'urgent' ? '🔴 Critical' : c.band === 'elevated' ? '🟠 Elevated' : c.band === 'watch' ? '🟡 Watch' : '🟢 Low'}</span>
                        </div>

                        {c.contributing_symptoms.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {c.contributing_symptoms.map((s) => (
                              <span key={s} className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-600">{s}</span>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-gray-400">Confidence: <span className="font-medium text-gray-600">{c.confidence}</span></p>
                      </div>
                    )
                  })}
                </div>

                {/* Lab analysis in report */}
                {labAnalysis && (
                  <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                    <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                      🧪 Lab Report Analysis
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{labAnalysis.summary}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {labAnalysis.extracted_values.map((v) => (
                        <div key={v.name} className={`rounded-xl p-2.5 text-xs border ${
                          v.status === 'critical' ? 'bg-red-50 border-red-200 text-red-700'
                          : v.status === 'abnormal' ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-green-50 border-green-200 text-green-700'
                        }`}>
                          <p className="font-semibold">{v.name}</p>
                          <p>{v.value} {v.unit}</p>
                          <p className="capitalize opacity-70">{v.status}</p>
                        </div>
                      ))}
                    </div>
                    {labAnalysis.flags.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-amber-700">Lab Flags</p>
                        {labAnalysis.flags.map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
                            <span>{FLAG_ICONS[f.severity]}</span>
                            <span><strong>{f.marker}:</strong> {f.concern}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {labAnalysis.recommendations.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-600">Recommendations</p>
                        {labAnalysis.recommendations.map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="text-[#0E7C66] mt-0.5">→</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Doctors */}
                {doctors.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2 text-sm">
                      <Stethoscope size={16} className="text-[#0E7C66]" />
                      Recommended Specialists
                    </h3>
                    <div className="space-y-2">
                      {doctors.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="w-10 h-10 rounded-full bg-[#0E7C66]/15 flex items-center justify-center text-sm font-bold text-[#0E7C66] shrink-0">
                            {doc.full_name.replace(/^Dr\.?\s*/i, '').split(' ').map((x: string) => x[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{doc.full_name}</p>
                            <p className="text-xs text-gray-500">{doc.specialty ?? 'Specialist'}</p>
                            {doc.facility_name && <p className="text-xs text-gray-400 truncate">{doc.facility_name}</p>}
                          </div>
                          {doc.telemedicine_available && (
                            <span className="text-xs text-teal-600 flex items-center gap-1 shrink-0">
                              <Video size={12} /> Tele
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/${dashboardType}/saathi/consultancy`)}
                      className="w-full text-center text-xs text-[#0E7C66] font-medium py-2 hover:underline"
                    >
                      View all doctors →
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={downloadReport}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0E7C66] text-white text-sm font-medium shadow-sm hover:bg-[#0c6b57] transition-colors"
                  >
                    <Download size={16} /> Download PDF Report
                  </button>
                  <button
                    onClick={reset}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors"
                  >
                    <RefreshCw size={16} /> Retake
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
