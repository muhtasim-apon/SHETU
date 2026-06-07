'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Phone, ExternalLink, Search } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('shetu_token') : ''
  return { Authorization: `Bearer ${token}` }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ConsultancyPage() {
  const router = useRouter()
  const [doctors, setDoctors] = useState<any[]>([])
  const [emergency, setEmergency] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [telemedicine, setTelemedicine] = useState(false)
  const [error, setError] = useState('')

  async function fetchDoctors(name = '', tele = false) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (name) params.set('name', name)
      if (tele) params.set('telemedicine_only', 'true')
      const res = await fetch(`${API_BASE}/api/v1/mother/doctors/search?${params}`, { headers: authHeaders() })
      const data = await res.json()
      setDoctors(data.doctors || [])
    } catch {
      setError('Could not load doctors. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDoctors()
    fetch(`${API_BASE}/api/v1/mother/doctors/emergency`, { headers: authHeaders() })
      .then(r => r.json()).then(setEmergency).catch(() => {})
  }, [])

  function handleSearch() {
    fetchDoctors(search, telemedicine)
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-10 pb-5 px-5">
        <button onClick={() => router.push('/dashboard/mother/saathi')}
          className="flex items-center gap-1 text-white/70 text-sm mb-2">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-[22px] font-bold text-white">Find a Gynaecologist</h1>
        <p className="text-[13px] text-white/70">Verified doctors · Telemedicine available</p>
      </div>

      <div className="px-4 pt-4">
        {/* Emergency banner */}
        <div className="border border-red-300 bg-red-50 rounded-2xl p-4 mb-4">
          <p className="text-[13px] font-semibold text-red-700 mb-2">📞 Maternal Emergency Contacts</p>
          <div className="space-y-1">
            {[
              { num: '999', label: 'National Emergency' },
              { num: '16767', label: 'DGHS Maternal Helpline (24/7)' },
              { num: '199', label: 'Ambulance' },
            ].map(c => (
              <a key={c.num} href={`tel:${c.num}`}
                className="flex items-center gap-2 text-red-700 text-[13px]">
                <Phone size={13} className="text-red-500" />
                <span className="font-bold">{c.num}</span>
                <span className="text-red-600/70">— {c.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-3 text-gray-400" />
              <input
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                placeholder="Name or district..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button onClick={handleSearch}
              className="bg-teal-600 text-white px-4 rounded-xl text-sm font-medium">
              Search
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setTelemedicine(false); fetchDoctors(search, false) }}
              className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${!telemedicine ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
              All
            </button>
            <button onClick={() => { setTelemedicine(true); fetchDoctors(search, true) }}
              className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${telemedicine ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600'}`}>
              Telemedicine Only
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin border-2 border-t-teal-600 rounded-full w-8 h-8" />
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10">
            No doctors found. Please broaden your search.
          </div>
        ) : (
          <div className="space-y-3">
            {doctors.map((d: any, i: number) => (
              <div key={d.id || i} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0">
                    {initials(d.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-800 truncate">{d.full_name}</p>
                    {d.qualification && (
                      <p className="text-[12px] text-gray-500 truncate">{d.qualification}</p>
                    )}
                    {d.bmdc_number && (
                      <p className="text-[11px] text-gray-400">BMDC: {d.bmdc_number}</p>
                    )}
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {(d.district || d.chamber_name) && (
                    <p className="text-[12px] text-gray-600">
                      {[d.district, d.chamber_name].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {d.visiting_hours && (
                    <span className="inline-block bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full">
                      {d.visiting_hours}
                    </span>
                  )}
                  {d.consultation_fee && (
                    <p className="text-[12px] text-gray-600 font-medium">BDT {d.consultation_fee}</p>
                  )}
                  {d.telemedicine_available && (
                    <span className="inline-block bg-green-100 text-green-700 text-[11px] px-2 py-0.5 rounded-full">
                      ✓ Telemedicine{d.telemedicine_platform ? ` · ${d.telemedicine_platform}` : ''}
                    </span>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  {d.phone && (
                    <a href={`tel:${d.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white py-2 rounded-xl text-sm font-medium">
                      <Phone size={14} /> Call
                    </a>
                  )}
                  <a href="https://www.bmdc.org.bd/member-information.php" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 py-2 px-3 rounded-xl text-sm">
                    <ExternalLink size={14} /> Verify BMDC
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center mt-4 mb-2">
          Always verify on bmdc.org.bd. Data is curated, not live BMDC.
        </p>
      </div>

      <BottomNav activeTab="home" />
    </div>
  )
}
