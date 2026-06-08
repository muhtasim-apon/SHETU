import { createClient } from './supabase'
import { ensurePatientId } from './patient-row'
import { saathiGet } from './saathi'
import type { RiskProfile, QAAnswer, RiskReport } from './risk-prediction'
import type { LabReportAnalysis } from './gemini'

export interface ClinicianRow {
  id: string
  full_name: string
  specialty: string | null
  telemedicine_available: boolean
  facility_name: string | null
  district: string | null
}

export async function saveRiskAssessment(
  profile: RiskProfile,
  answers: QAAnswer[],
  report: RiskReport,
  labAnalysis?: LabReportAnalysis | null,
): Promise<string | null> {
  const patientId = await ensurePatientId()
  if (!patientId) {
    console.error('[Drishti] no patient id — assessment not saved')
    return null
  }

  const sb = createClient()
  const { data, error } = await sb
    .from('risk_assessments')
    .insert({
      patient_id: patientId,
      intake_profile: profile,
      questions_answered: answers,
      total_turns: answers.length,
      raw_llm_response: report,
      model_used: 'drishti-v1',
      risk_band: report.overall_band,
      overall_band: report.overall_band,
      top_conditions: report.conditions,
      recommended_action: report.next_action,
      action_timeframe: report.timeframe,
      alert_chw: report.alert_chw ?? false,
      specialist_needed: report.specialist_needed ?? false,
      lab_values_extracted: labAnalysis ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Drishti] save assessment failed:', error.message)
    return null
  }

  const assessmentId = data?.id ?? null

  // Companion report card row (best-effort).
  if (assessmentId) {
    const { error: cardErr } = await sb.from('risk_report_cards').insert({
      assessment_id: assessmentId,
      patient_id: patientId,
      overall_band: report.overall_band,
      conditions_summary: report.conditions,
      next_action: report.next_action,
      action_timeframe: report.timeframe,
      chw_alert_shown: report.alert_chw ?? false,
      specialist_strip_shown: report.specialist_needed ?? false,
    })
    if (cardErr) console.error('[Drishti] report card insert failed:', cardErr.message)
  }

  // Update the patient's triage band; best-effort.
  await sb.from('patients').update({ last_risk_band: report.overall_band }).eq('id', patientId)

  return assessmentId
}

export async function fetchDoctorsBySpecialty(specialties: string[]): Promise<ClinicianRow[]> {
  if (specialties.length === 0) return []

  // Try the backend doctor search first (rich data); fall back to direct read.
  try {
    const q = specialties.slice(0, 2).map((s) => `specialty=${encodeURIComponent(s)}`).join('&')
    const res = await saathiGet<{ doctors: ClinicianRow[] }>(`/api/v1/doctors/search?${q}&limit=6`)
    if (res.doctors?.length) return res.doctors
  } catch {
    /* fall through to direct read */
  }

  try {
    const sb = createClient()
    const { data } = await sb
      .from('clinicians')
      .select('id, specialty, telemedicine_available, profiles!inner(full_name), facilities(name, district)')
      .or(specialties.map((s) => `specialty.ilike.%${s}%`).join(','))
      .limit(6)

    return (data ?? []).map((row: Record<string, unknown>) => {
      const prof = row.profiles as Record<string, unknown> | null
      const fac = row.facilities as Record<string, unknown> | null
      return {
        id: row.id as string,
        full_name: (prof?.full_name as string) ?? 'Dr. Specialist',
        specialty: row.specialty as string | null,
        telemedicine_available: (row.telemedicine_available as boolean) ?? false,
        facility_name: (fac?.name as string) ?? null,
        district: (fac?.district as string) ?? null,
      }
    })
  } catch {
    return []
  }
}
