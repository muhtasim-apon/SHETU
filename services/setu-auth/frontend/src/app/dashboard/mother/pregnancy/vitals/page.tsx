'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Heart, Activity, Thermometer, Weight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useMother } from '@/lib/mother-utils'
import BottomNav from '@/components/mother/BottomNav'
import type { Vital } from '@/lib/types'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function VitalsPage() {
  const router = useRouter()
  const { patient, pregnancy, loading } = useMother()
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [temperature, setTemperature] = useState('')
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [history, setHistory] = useState<Vital[]>([])

  useEffect(() => {
    if (loading) return
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    if (!patient || !pregnancy) { router.replace('/dashboard/mother/onboarding'); return }
    loadHistory()
  }, [loading, patient, pregnancy])

  async function loadHistory() {
    if (!patient) return
    const supabase = createClient()
    const { data } = await supabase
      .from('vitals')
      .select('*')
      .eq('patient_id', patient.id)
      .order('recorded_at', { ascending: false })
      .limit(5)
    if (data) setHistory(data as Vital[])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!patient || !pregnancy) return
    setSaving(true)
    try {
      const raw = localStorage.getItem('shetu_user')
      const userId = raw ? JSON.parse(raw).id : ''
      const supabase = createClient()

      const sys = systolic ? parseInt(systolic) : null
      const dia = diastolic ? parseInt(diastolic) : null
      const pul = pulse ? parseInt(pulse) : null
      const temp = temperature ? parseFloat(temperature) : null
      const wt = weight ? parseFloat(weight) : null

      const flags: Array<{ type: string; severity: string; message: string }> = []
      if (sys && dia && (sys > 140 || dia > 90)) {
        flags.push({ type: 'high_bp', severity: 'elevated', message: 'Blood pressure is elevated. Contact your doctor.' })
      }
      if (temp && temp > 38) {
        flags.push({ type: 'fever', severity: 'elevated', message: 'Temperature indicates fever. Rest and consult your doctor.' })
      }

      const { error } = await supabase.from('vitals').insert({
        patient_id: patient.id,
        pregnancy_id: pregnancy.id,
        recorded_by: userId,
        source: 'manual',
        systolic_bp: sys,
        diastolic_bp: dia,
        pulse_bpm: pul,
        temperature_c: temp,
        weight_kg: wt,
        has_flags: flags.length > 0,
        flag_details: flags.length > 0 ? flags : null,
        recorded_at: new Date().toISOString(),
      })

      if (error) throw error

      setSystolic(''); setDiastolic(''); setPulse(''); setTemperature(''); setWeight('')
      setToast('✓ Vitals saved successfully')
      setTimeout(() => setToast(''), 3000)
      await loadHistory()
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Failed to save vitals')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center">
        <div className="animate-spin border-2 border-t-[#0E7C66] rounded-full w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white shadow-sm px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.push('/dashboard/mother/pregnancy')} className="p-1">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm leading-none">Log Vitals</p>
          <p className="text-xs text-gray-500 mt-0.5">BP · Weight · Temp · Pulse</p>
        </div>
      </div>

      {toast && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-2.5 text-sm font-medium ${
          toast.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {toast}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm mx-4 mt-4 p-5">
        <p className="font-semibold text-[16px] text-gray-800">Record Today&apos;s Vitals</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Blood Pressure */}
        <div className="mt-5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
            <Heart size={15} className="text-red-400" /> Blood Pressure
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={systolic}
              onChange={e => setSystolic(e.target.value)}
              placeholder="120"
              min={60} max={250}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <span className="text-gray-400 font-bold text-lg">/</span>
            <input
              type="number"
              value={diastolic}
              onChange={e => setDiastolic(e.target.value)}
              placeholder="80"
              min={40} max={150}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <span className="text-xs text-gray-400 shrink-0">mmHg</span>
          </div>
        </div>

        {/* Pulse */}
        <div className="mt-4">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
            <Activity size={15} className="text-orange-400" /> Pulse Rate
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={pulse}
              onChange={e => setPulse(e.target.value)}
              placeholder="72"
              min={30} max={220}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <span className="text-xs text-gray-400">bpm</span>
          </div>
        </div>

        {/* Temperature */}
        <div className="mt-4">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
            <Thermometer size={15} className="text-blue-400" /> Temperature
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={temperature}
              onChange={e => setTemperature(e.target.value)}
              placeholder="36.6"
              min={34} max={43}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <span className="text-xs text-gray-400">°C</span>
          </div>
        </div>

        {/* Weight */}
        <div className="mt-4">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
            <Weight size={15} className="text-teal-400" /> Weight
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="55.0"
              min={30} max={200}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <span className="text-xs text-gray-400">kg</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full mt-6 bg-[#0E7C66] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <span className="animate-spin border-2 border-t-white rounded-full w-4 h-4" />}
          Save Vitals →
        </button>
      </form>

      {/* History */}
      <div className="mx-4 mt-4 mb-24">
        <p className="font-semibold text-[16px] text-gray-800 mb-3">Recent Readings</p>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No vitals logged yet. Record your first reading above.
          </p>
        ) : (
          history.map(v => (
            <div key={v.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">{formatDate(v.recorded_at)}</p>
                {v.has_flags && (
                  <span className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                    ⚠ Elevated
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {v.systolic_bp && v.diastolic_bp && (
                  <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                    BP: {v.systolic_bp}/{v.diastolic_bp}
                  </span>
                )}
                {v.pulse_bpm && (
                  <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                    Pulse: {v.pulse_bpm}
                  </span>
                )}
                {v.temperature_c && (
                  <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                    Temp: {v.temperature_c}°C
                  </span>
                )}
                {v.weight_kg && (
                  <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                    Weight: {v.weight_kg}kg
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <BottomNav activeTab="vitals" />
    </div>
  )
}
