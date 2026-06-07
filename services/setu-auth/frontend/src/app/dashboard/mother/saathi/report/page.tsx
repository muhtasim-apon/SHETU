'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('shetu_token') : ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

const RISK_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-800 border-green-300',
  watch: 'bg-amber-100 text-amber-800 border-amber-300',
  elevated: 'bg-orange-100 text-orange-800 border-orange-300',
  urgent: 'bg-red-100 text-red-800 border-red-300',
}
const RISK_LABELS: Record<string, string> = {
  low: '✓ Risk: Low',
  watch: '⚠ Risk: Watch',
  elevated: '⚠ Risk: Elevated',
  urgent: '🚨 Risk: Urgent',
}

const LOADING_STEPS = [
  'Gathering your vitals data...',
  'Analysing with Shetu Saathi AI...',
  'Building your PDF report...',
]

export default function ReportPage() {
  const router = useRouter()
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly' | 'custom'>('weekly')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [language, setLanguage] = useState<'en' | 'bn'>('en')
  const [generating, setGenerating] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [report, setReport] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mother/reports/history?limit=5`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setHistory(d.reports || [])).catch(() => {})
  }, [])

  async function generate() {
    setGenerating(true)
    setError('')
    setReport(null)
    setLoadStep(0)

    const stepInterval = setInterval(() => {
      setLoadStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 2500)

    try {
      const body: any = { period_type: periodType, language }
      if (periodType === 'custom') {
        body.period_start = periodStart
        body.period_end = periodEnd
      }
      const res = await fetch(`${API_BASE}/api/v1/mother/reports/generate`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Generation failed')
      setReport(data)
      // Refresh history
      fetch(`${API_BASE}/api/v1/mother/reports/history?limit=5`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setHistory(d.reports || [])).catch(() => {})
    } catch (err: any) {
      setError(err.message)
    } finally {
      clearInterval(stepInterval)
      setGenerating(false)
    }
  }

  async function downloadPdf(id: string, start: string, end: string) {
    const res = await fetch(`${API_BASE}/api/v1/mother/reports/${id}/pdf`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('shetu_token')}` },
    })
    if (!res.ok) { setError('PDF not available'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shetu_maternal_report_${start}_${end}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-10 pb-5 px-5">
        <button onClick={() => router.push('/dashboard/mother/saathi')}
          className="flex items-center gap-1 text-white/70 text-sm mb-2">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-[22px] font-bold text-white">Pregnancy Health Report</h1>
        <p className="text-[13px] text-white/70">AI-powered maternal analysis</p>
      </div>

      <div className="px-4 pt-4">
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Generate card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="text-[14px] font-semibold text-gray-800 mb-3">Generate Report</p>

          {/* Period selector */}
          <div className="flex gap-2 mb-3">
            {(['weekly', 'monthly', 'custom'] as const).map(pt => (
              <button key={pt} onClick={() => setPeriodType(pt)}
                className={`flex-1 py-2 rounded-xl text-sm border font-medium transition-colors ${periodType === pt ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </button>
            ))}
          </div>

          {periodType === 'custom' && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <p className="text-[12px] text-gray-500 mb-1">From</p>
                <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              </div>
              <div className="flex-1">
                <p className="text-[12px] text-gray-500 mb-1">To</p>
                <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          )}

          {/* Language toggle */}
          <div className="flex gap-2 mb-4">
            {(['en', 'bn'] as const).map(l => (
              <button key={l} onClick={() => setLanguage(l)}
                className={`px-4 py-1.5 rounded-xl text-sm border transition-colors ${language === l ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
                {l === 'en' ? 'English' : 'বাংলা'}
              </button>
            ))}
          </div>

          <button onClick={generate} disabled={generating}
            className="w-full bg-[#0E7C66] text-white font-semibold py-3.5 rounded-2xl text-[15px] disabled:opacity-60">
            {generating ? LOADING_STEPS[loadStep] : 'Generate Pregnancy Report'}
          </button>
          {generating && (
            <div className="flex justify-center gap-1 mt-3">
              {[0, 1, 2].map(i => (
                <div key={i} className={`w-2 h-2 rounded-full bg-teal-500 ${i === loadStep % 3 ? 'animate-bounce' : 'opacity-30'}`} />
              ))}
            </div>
          )}
        </div>

        {/* Report display */}
        {report && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <div className={`border rounded-xl px-4 py-3 mb-4 text-sm font-semibold ${RISK_STYLES[report.overall_risk_band] || RISK_STYLES.watch}`}>
              {RISK_LABELS[report.overall_risk_band] || '⚠ Risk: Watch'}
            </div>

            {report.ai_summary && (
              <div className="mb-4">
                <p className="text-[13px] font-semibold text-gray-700 mb-1">AI Summary</p>
                <p className="text-[13px] text-gray-600">{report.ai_summary}</p>
              </div>
            )}

            {(report.ai_recommendations || []).length > 0 && (
              <div className="mb-4">
                <p className="text-[13px] font-semibold text-gray-700 mb-2">Recommendations</p>
                {report.ai_recommendations.map((r: string, i: number) => (
                  <p key={i} className="text-[13px] text-gray-600 mb-1">
                    <span className="text-teal-600 font-bold">{i + 1}. </span>{r}
                  </p>
                ))}
              </div>
            )}

            {(report.anc_advice || report.nutrition_tip) && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4">
                {report.anc_advice && <p className="text-[12px] text-teal-700 mb-1"><b>ANC:</b> {report.anc_advice}</p>}
                {report.nutrition_tip && <p className="text-[12px] text-teal-700"><b>Nutrition:</b> {report.nutrition_tip}</p>}
              </div>
            )}

            {(report.ai_alerts || []).length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-4">
                <p className="text-[13px] font-semibold text-red-700 mb-1">⚠ Alerts</p>
                {report.ai_alerts.map((a: string, i: number) => (
                  <p key={i} className="text-[12px] text-red-600">• {a}</p>
                ))}
              </div>
            )}

            {report.pdf_available && (
              <button onClick={() => downloadPdf(report.id, report.period_start, report.period_end)}
                className="w-full flex items-center justify-center gap-2 border border-teal-500 text-teal-700 font-semibold py-3 rounded-2xl text-sm">
                <Download size={16} /> Download PDF
              </button>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-gray-700 mb-2">Past Reports</p>
            {history.map((r: any) => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm p-3 mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-gray-500">{r.period_start} → {r.period_end}</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${RISK_STYLES[r.overall_risk_band] || 'bg-gray-100 text-gray-600'}`}>
                    {r.overall_risk_band || 'unknown'}
                  </span>
                </div>
                <button onClick={() => downloadPdf(r.id, r.period_start, r.period_end)}
                  className="text-teal-600 text-[12px] font-medium flex items-center gap-1">
                  <FileText size={14} /> View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav activeTab="home" />
    </div>
  )
}
