'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Phone, Mic, MicOff, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useMother } from '@/lib/mother-utils'
import BottomNav from '@/components/mother/BottomNav'
import type { SOSEvent, EmergencyContact } from '@/lib/types'

const SOS_KEYWORDS = [
  'help', 'emergency', 'sos', 'danger', 'pain', 'bleeding',
  'সাহায্য', 'জরুরি', 'বিপদ', 'ব্যথা', 'রক্ত',
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusColor(status: string) {
  if (status === 'resolved') return 'bg-green-50 text-green-700'
  if (status === 'false_alarm') return 'bg-gray-50 text-gray-500'
  if (status === 'acknowledged') return 'bg-blue-50 text-blue-700'
  return 'bg-red-50 text-red-600'
}

export default function SOSPage() {
  const router = useRouter()
  const { patient, pregnancy, loading } = useMother()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [listening, setListening] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [sosHistory, setSosHistory] = useState<SOSEvent[]>([])
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [showAddContact, setShowAddContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRelation, setNewRelation] = useState('Husband')
  const [overlayEventId, setOverlayEventId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) return
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    if (!patient || !pregnancy) { router.replace('/dashboard/mother/onboarding'); return }

    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
    loadData()
  }, [loading, patient, pregnancy])

  async function loadData() {
    if (!patient) return
    const supabase = createClient()
    const [{ data: sos }, { data: ctcs }] = await Promise.all([
      supabase.from('sos_events').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('emergency_contacts').select('*').eq('patient_id', patient.id),
    ])
    if (sos) setSosHistory(sos as SOSEvent[])
    if (ctcs) setContacts(ctcs as EmergencyContact[])
  }

  async function triggerSOS(triggerType: 'manual' | 'wake_word') {
    if (!patient) return null
    const raw = localStorage.getItem('shetu_user')
    const userId = raw ? JSON.parse(raw).id : ''
    const supabase = createClient()
    const { data } = await supabase
      .from('sos_events')
      .insert({
        patient_id: patient.id,
        triggered_by: userId,
        trigger_type: triggerType,
        status: 'triggered',
        red_flag_signal: triggerType === 'manual' ? 'manual_button_press' : 'wake_word_detected',
        location_lat: location?.lat ?? null,
        location_lng: location?.lng ?? null,
        ambulance_contact_notified: false,
        family_notified: false,
      })
      .select('id')
      .single()
    await loadData()
    return data?.id ?? null
  }

  async function handleManualSOS() {
    await triggerSOS('manual')
    window.location.href = 'tel:999'
  }

  async function startVoiceListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setToast('Voice SOS not supported on this browser. Use the Call button above.')
      setTimeout(() => setToast(''), 5000)
      return
    }

    // Explicitly ask for microphone permission first so the browser shows the
    // allow/block prompt. If the user previously blocked it, this rejects and
    // we guide them to re-enable it (the lock/🔒 icon in the address bar).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // We only needed the permission grant; release the mic for the
      // SpeechRecognition engine to use it.
      stream.getTracks().forEach(t => t.stop())
    } catch {
      setToast(
        'Microphone is blocked. Tap the 🔒 / camera icon in your browser address bar, ' +
        'set Microphone to "Allow", then try again.'
      )
      setTimeout(() => setToast(''), 8000)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.lang = 'bn-BD'
    // interimResults = true so we react to partial speech instantly instead of
    // waiting for the speaker to pause — critical in an emergency.
    recognition.interimResults = true

    let fired = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = async (event: any) => {
      if (fired) return
      const transcript = Array.from(event.results as unknown[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript.toLowerCase())
        .join(' ')

      if (SOS_KEYWORDS.some(kw => transcript.includes(kw))) {
        fired = true
        recognition.stop()
        setListening(false)

        // Short beep for feedback (best-effort, never blocks the call).
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          osc.connect(ctx.destination)
          osc.frequency.value = 880
          osc.start()
          setTimeout(() => osc.stop(), 400)
        } catch { /* ignore */ }

        // Log the event in the background — do NOT await it, the call must be
        // immediate. Then dial 999 right away (no countdown).
        triggerSOS('wake_word').catch(() => {})
        window.location.href = 'tel:999'
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setListening(false)
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setToast(
          'Microphone is blocked. Tap the 🔒 / camera icon in your browser address bar, ' +
          'set Microphone to "Allow", then try again.'
        )
        setTimeout(() => setToast(''), 8000)
      }
    }
    recognition.onend = () => setListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }

  function stopVoiceListening() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  useEffect(() => {
    if (!overlay) return
    setCountdown(5)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          setOverlay(false)
          window.location.href = 'tel:999'
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current!)
  }, [overlay])

  async function cancelOverlay() {
    clearInterval(countdownRef.current!)
    setOverlay(false)
    if (overlayEventId) {
      const supabase = createClient()
      await supabase.from('sos_events').update({ status: 'false_alarm' }).eq('id', overlayEventId)
      await loadData()
    }
    setOverlayEventId(null)
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault()
    if (!patient) return
    const supabase = createClient()
    await supabase.from('emergency_contacts').insert({
      patient_id: patient.id,
      name: newName,
      phone: newPhone,
      relation: newRelation,
      is_primary: contacts.length === 0,
    })
    setNewName(''); setNewPhone(''); setNewRelation('Husband')
    setShowAddContact(false)
    await loadData()
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
      {/* Emergency Overlay */}
      {overlay && (
        <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center px-6">
          <div className="text-7xl mb-4">🚨</div>
          <p className="text-white text-[24px] font-bold text-center">EMERGENCY DETECTED</p>
          <p className="text-white/90 text-xl mt-4 font-mono">Calling 999 in {countdown}...</p>
          <button
            onClick={cancelOverlay}
            className="mt-10 px-8 py-3 border-2 border-white text-white rounded-xl font-semibold text-lg"
          >
            CANCEL (false alarm)
          </button>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-red-50 border-b border-red-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.push('/dashboard/mother/pregnancy')} className="p-1">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm leading-none">Emergency SOS</p>
          <p className="text-xs text-gray-500 mt-0.5">Shetu Maa</p>
        </div>
      </div>

      {toast && (
        <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-xl px-3 py-2">
          {toast}
        </div>
      )}

      {/* SOS Button */}
      <div className="pt-6 px-6 flex flex-col items-center">
        <button
          onClick={handleManualSOS}
          className="w-32 h-32 rounded-full bg-red-500 shadow-2xl flex items-center justify-center animate-pulse hover:scale-105 transition-transform"
        >
          <Phone size={48} className="text-white" />
        </button>
        <p className="text-red-600 font-bold text-[16px] mt-3">CALL 999</p>
        <p className="text-sm text-gray-500 mt-1 text-center">Tap to call Bangladesh emergency services</p>
      </div>

      {/* Voice Detection */}
      <div className="bg-white rounded-2xl mx-4 mt-5 p-5 shadow-sm">
        <p className="font-semibold text-[15px] text-gray-800">🎙️ Voice SOS</p>
        <p className="text-xs text-gray-500 mt-1">
          Say &apos;Help&apos;, &apos;Emergency&apos; or &apos;সাহায্য&apos; — it dials 999 instantly
        </p>
        <div className="flex items-center gap-2 mt-3">
          {listening ? (
            <span className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LISTENING...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              NOT LISTENING
            </span>
          )}
        </div>
        <button
          onClick={listening ? stopVoiceListening : startVoiceListening}
          className={`mt-3 w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 ${
            listening
              ? 'bg-red-500 text-white'
              : 'border-2 border-[#0E7C66] text-[#0E7C66]'
          }`}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
          {listening ? 'Stop Listening' : 'Start Voice Watch'}
        </button>
      </div>

      {/* Emergency Contacts */}
      <div className="bg-white rounded-2xl mx-4 mt-4 p-5 shadow-sm">
        <p className="font-semibold text-gray-800 mb-3">Your Emergency Contacts</p>

        {contacts.length === 0 && patient?.emergency_contact_phone && (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#0E7C66] flex items-center justify-center text-white text-sm font-bold">
                {patient.emergency_contact_name?.[0]?.toUpperCase() ?? 'E'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{patient.emergency_contact_name}</p>
                <p className="text-xs text-gray-400">{patient.emergency_contact_phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-teal-50 text-teal-700 rounded-full px-2 py-0.5">
                {patient.emergency_contact_relation}
              </span>
              <a
                href={`tel:${patient.emergency_contact_phone}`}
                className="text-xs bg-green-500 text-white rounded-lg px-2 py-1"
              >
                Call
              </a>
            </div>
          </div>
        )}

        {contacts.map(c => (
          <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#0E7C66] flex items-center justify-center text-white text-sm font-bold">
                {c.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.relation && (
                <span className="text-xs bg-teal-50 text-teal-700 rounded-full px-2 py-0.5">
                  {c.relation}
                </span>
              )}
              <a
                href={`tel:${c.phone}`}
                className="text-xs bg-green-500 text-white rounded-lg px-2 py-1"
              >
                Call
              </a>
            </div>
          </div>
        ))}

        {showAddContact ? (
          <form onSubmit={addContact} className="mt-2 space-y-2">
            <input
              type="text"
              required
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Contact name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <input
              type="tel"
              required
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            />
            <select
              value={newRelation}
              onChange={e => setNewRelation(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            >
              <option>Husband</option>
              <option>Mother</option>
              <option>Sister</option>
              <option>Other</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-[#0E7C66] text-white text-sm font-semibold py-2 rounded-xl"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-3 py-2 text-gray-500 border border-gray-200 rounded-xl"
              >
                <X size={16} />
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddContact(true)}
            className="mt-2 w-full py-2 border-2 border-[#0E7C66] text-[#0E7C66] text-sm font-semibold rounded-xl flex items-center justify-center gap-1"
          >
            <Plus size={16} /> Add Contact
          </button>
        )}
      </div>

      {/* SOS History */}
      <div className="bg-white rounded-2xl mx-4 mt-4 mb-24 p-5 shadow-sm">
        <p className="font-semibold text-gray-800 mb-3">SOS History</p>
        {sosHistory.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No SOS events recorded.</p>
        ) : (
          sosHistory.map(ev => (
            <div key={ev.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-xs text-gray-500">{formatDate(ev.created_at)}</p>
                <p className="text-sm font-medium text-gray-700 capitalize">{ev.trigger_type.replace('_', ' ')}</p>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${statusColor(ev.status)}`}>
                {ev.status.replace('_', ' ')}
              </span>
            </div>
          ))
        )}
      </div>

      <BottomNav activeTab="sos" />
    </div>
  )
}
