'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 1 | 2

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 fields
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactRelation, setContactRelation] = useState('Husband')

  // Step 2 fields
  const [lmpDate, setLmpDate] = useState('')
  const [patientId, setPatientId] = useState('')

  // Computed EDD display
  const eddDisplay = (() => {
    if (!lmpDate) return ''
    const d = new Date(lmpDate)
    d.setDate(d.getDate() + 280)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  useEffect(() => {
    const token = localStorage.getItem('shetu_token')
    if (!token) router.replace('/auth/signin')
  }, [router])

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const raw = localStorage.getItem('shetu_user')
      if (!raw) throw new Error('Not authenticated')
      const user = JSON.parse(raw)
      const supabase = createClient()

      const patientCode =
        'MAA-' +
        new Date().getFullYear() +
        '-' +
        String(Math.floor(Math.random() * 999999)).padStart(6, '0')

      const { data, error: err } = await supabase
        .from('patients')
        .insert({
          profile_id: user.id,
          patient_code: patientCode,
          emergency_contact_name: contactName,
          emergency_contact_phone: contactPhone,
          emergency_contact_relation: contactRelation,
        })
        .select('id')
        .single()

      if (err) throw err
      setPatientId(data.id)
      setStep(2)
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message || 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!lmpDate) { setError('Please select your LMP date'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('pregnancies')
        .insert({
          patient_id: patientId,
          lmp_date: lmpDate,
          status: 'active',
        })

      if (err) throw err
      router.replace('/dashboard/mother/pregnancy')
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message || 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#08231F] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-[#0E7C66] font-bold text-xl tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>
            SHETU MAA
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className={`w-8 h-2 rounded-full ${step >= 1 ? 'bg-[#0E7C66]' : 'bg-gray-200'}`} />
            <div className={`w-8 h-2 rounded-full ${step >= 2 ? 'bg-[#0E7C66]' : 'bg-gray-200'}`} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Step {step} of 2</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Emergency Contact</h2>
              <p className="text-xs text-gray-500 mt-0.5">Required for SOS alerts in emergencies.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
              <input
                type="text"
                required
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Full name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="+880..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relation *</label>
              <select
                value={contactRelation}
                onChange={e => setContactRelation(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
              >
                <option>Husband</option>
                <option>Mother</option>
                <option>Sister</option>
                <option>Other</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0E7C66] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <span className="animate-spin border-2 border-t-white rounded-full w-4 h-4" />}
              Continue →
            </button>
          </form>
        ) : (
          <form onSubmit={handleStep2} className="space-y-4">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Pregnancy Start Date</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                This helps us calculate your due date and weekly progress.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                When did your last period start?
              </label>
              <input
                type="date"
                required
                value={lmpDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setLmpDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
              />
            </div>

            {eddDisplay && (
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                <p className="text-xs text-teal-600">Estimated Due Date</p>
                <p className="text-[#0E7C66] font-bold text-base mt-0.5">{eddDisplay}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0E7C66] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <span className="animate-spin border-2 border-t-white rounded-full w-4 h-4" />}
              Start My Journey →
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
