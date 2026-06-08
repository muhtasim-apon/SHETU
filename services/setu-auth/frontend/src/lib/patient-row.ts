import { createClient } from './supabase'

/**
 * Resolve the caller's `patients.id`, creating the row on first use.
 *
 * Every Drishti/Pushti table is keyed by `patient_id`, and their RLS policies
 * read `patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())`.
 * A freshly-signed-up user (especially `mother`) may not have a patients row
 * yet, so we create it here. The `patients_own` policy is
 * `FOR ALL USING (profile_id = auth.uid())`, so the browser (carrying the
 * user JWT) is allowed to insert its own row.
 *
 * Writes go through the browser — not the FastAPI backend — because Python's
 * httpx hits TLS handshake timeouts to Supabase under WSL2, while the browser
 * uses native OS networking and is reliable. This mirrors how auth works.
 */
export async function ensurePatientId(): Promise<string | null> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('shetu_user') : null
  if (!raw) return null

  let profileId: string
  try {
    profileId = JSON.parse(raw).id
  } catch {
    return null
  }
  if (!profileId) return null

  const sb = createClient()

  const { data: existing, error: selErr } = await sb
    .from('patients')
    .select('id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle()

  if (selErr) console.error('[patients] select failed:', selErr.message)
  if (existing?.id) return existing.id

  const patientCode = `PT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  const { data: created, error: insErr } = await sb
    .from('patients')
    .insert({ profile_id: profileId, patient_code: patientCode })
    .select('id')
    .single()

  if (insErr) {
    console.error('[patients] insert failed:', insErr.message)
    // Possible race: another tab created it. Re-select.
    const { data: retry } = await sb
      .from('patients')
      .select('id')
      .eq('profile_id', profileId)
      .limit(1)
      .maybeSingle()
    return retry?.id ?? null
  }

  return created?.id ?? null
}
