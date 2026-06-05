export type UserRole = 'admin' | 'mother' | 'patient'
export type RiskBand = 'low' | 'watch' | 'elevated' | 'urgent'
export type PregnancyStatus = 'active' | 'delivered' | 'lost' | 'terminated'
export type Trimester = '1' | '2' | '3'
export type MessageRole = 'user' | 'assistant' | 'system'
export type SOSStatus = 'triggered' | 'acknowledged' | 'resolved' | 'false_alarm'
export type SOSTriggerType = 'manual' | 'wake_word' | 'clinician' | 'chw'

export interface Profile {
  id: string
  email: string
  role: UserRole
  full_name: string
  phone?: string
}

export interface Patient {
  id: string
  profile_id: string
  patient_code: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  last_risk_band?: RiskBand
}

export interface Pregnancy {
  id: string
  patient_id: string
  lmp_date: string
  edd: string
  gestational_age_weeks: number
  trimester: Trimester
  anc_count: number
  status: PregnancyStatus
}

export interface Vital {
  id: string
  patient_id: string
  recorded_at: string
  systolic_bp?: number
  diastolic_bp?: number
  pulse_bpm?: number
  temperature_c?: number
  weight_kg?: number
  has_flags: boolean
  flag_details?: Array<{ type: string; severity: string; message: string }>
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  red_flag_detected: boolean
  red_flag_type?: string
  created_at: string
}

export interface SOSEvent {
  id: string
  patient_id: string
  trigger_type: SOSTriggerType
  status: SOSStatus
  created_at: string
  red_flag_signal?: string
}

export interface EmergencyContact {
  id: string
  patient_id: string
  name: string
  phone: string
  relation?: string
  is_primary: boolean
}
