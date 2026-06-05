'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile, Patient, Pregnancy } from '@/lib/types'

export interface MotherContext {
  profile: Profile | null
  patient: Patient | null
  pregnancy: Pregnancy | null
  loading: boolean
  error: string | null
}

export function useMother(): MotherContext {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [pregnancy, setPregnancy] = useState<Pregnancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem('shetu_user')
        const token = localStorage.getItem('shetu_token')
        if (!token || !raw) {
          setError('Not authenticated')
          setLoading(false)
          return
        }
        const userData = JSON.parse(raw)
        const userId: string = userData.id

        const supabase = createClient()

        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (profileErr || !profileData) {
          setError('Profile not found')
          setLoading(false)
          return
        }
        setProfile(profileData as Profile)

        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('profile_id', userId)
          .maybeSingle()

        if (!patientData) {
          setLoading(false)
          return
        }
        setPatient(patientData as Patient)

        const { data: pregnancyData } = await supabase
          .from('pregnancies')
          .select('*')
          .eq('patient_id', patientData.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (pregnancyData) {
          setPregnancy(pregnancyData as Pregnancy)
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { profile, patient, pregnancy, loading, error }
}

export function formatEDD(eddDate: string): string {
  return new Date(eddDate).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export function getTrimesterLabel(trimester: string): string {
  if (trimester === '1') return 'First Trimester'
  if (trimester === '2') return 'Second Trimester'
  return 'Third Trimester'
}

export function getTrimesterEmoji(trimester: string): string {
  if (trimester === '1') return '🌱'
  if (trimester === '2') return '🤰'
  return '👶'
}

export function getTrimesterWeekRange(trimester: string): string {
  if (trimester === '1') return 'Weeks 1–12'
  if (trimester === '2') return 'Weeks 13–26'
  return 'Weeks 27–40'
}

export function getProgressPercent(weeks: number): number {
  return Math.min((weeks / 40) * 100, 100)
}
