-- =============================================================================
-- SHETU Healthcare Platform - Supabase PostgreSQL DDL Schema
-- Bangladesh Maternal Health Platform
-- Version: 1.0.0 | Date: 2026-06-02
-- Compliance: GDPR, Bangladesh PDPA, 7-year clinical data retention
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- =============================================================================
-- UTILITY: updated_at TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('patient', 'chw', 'clinician', 'admin', 'ministry');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'third_gender', 'prefer_not_to_say');
CREATE TYPE consent_type AS ENUM ('data_processing', 'voice_storage', 'research', 'analytics', 'telemedicine');
CREATE TYPE risk_band AS ENUM ('low', 'watch', 'elevated', 'urgent');
CREATE TYPE pregnancy_status AS ENUM ('active', 'delivered', 'lost', 'terminated');
CREATE TYPE trimester AS ENUM ('1', '2', '3');
CREATE TYPE urine_protein_level AS ENUM ('none', 'trace', '1+', '2+', '3+', '4+');
CREATE TYPE symptom_severity AS ENUM ('mild', 'moderate', 'severe');
CREATE TYPE condition_status AS ENUM ('active', 'resolved', 'chronic');
CREATE TYPE session_type AS ENUM ('voice', 'text', 'mixed');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE language_code AS ENUM ('bn', 'en', 'mixed');
CREATE TYPE sos_trigger_type AS ENUM ('wake_word', 'manual', 'clinician', 'chw');
CREATE TYPE sos_status AS ENUM ('triggered', 'acknowledged', 'ambulance_dispatched', 'resolved', 'false_alarm');
CREATE TYPE teleconsult_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE nutrition_condition AS ENUM ('pregnancy', 'anaemia', 'diabetes', 'child_malnutrition', 'postpartum');
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE reward_action_type AS ENUM ('anc_visit', 'meal_log', 'symptom_report', 'vitals_log', 'education_complete');
CREATE TYPE knowledge_source_type AS ENUM ('who_guideline', 'dghs_protocol', 'bdhs_data', 'research_paper', 'food_db', 'synthetic');
CREATE TYPE knowledge_language AS ENUM ('en', 'bn', 'both');
CREATE TYPE visit_type AS ENUM ('antenatal', 'postnatal', 'routine', 'emergency');
CREATE TYPE facility_type AS ENUM ('upazila_health_complex', 'district_hospital', 'community_clinic', 'private');
CREATE TYPE appointment_type AS ENUM ('anc', 'teleconsult', 'emergency', 'routine');
CREATE TYPE appointment_status AS ENUM ('booked', 'confirmed', 'completed', 'cancelled');
CREATE TYPE ai_module AS ENUM ('maa', 'saathi', 'drishti', 'pushti', 'lite', 'os');
CREATE TYPE model_provider AS ENUM ('anthropic', 'openai', 'google', 'ondevice');
CREATE TYPE hitl_decision AS ENUM ('approved', 'overridden', 'escalated');
CREATE TYPE sync_operation AS ENUM ('insert', 'update', 'delete');
CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'conflict', 'failed');
CREATE TYPE lab_interpretation AS ENUM ('normal', 'abnormal', 'critical');
CREATE TYPE vital_source AS ENUM ('manual', 'wearable', 'chw', 'auto');

-- =============================================================================
-- CORE AUTH & USERS
-- =============================================================================

-- profiles extends Supabase auth.users
CREATE TABLE profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role              user_role         NOT NULL DEFAULT 'patient',
  full_name         TEXT              NOT NULL,
  phone             TEXT,
  division          TEXT,
  district          TEXT,
  upazila           TEXT,
  union_name        TEXT,
  language_pref     language_code     NOT NULL DEFAULT 'bn',
  gender            gender_type,
  date_of_birth     DATE,
  avatar_url        TEXT,
  is_active         BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Extends Supabase auth.users with app-level profile data for all user roles.';
COMMENT ON COLUMN profiles.role IS 'User role: patient, chw (community health worker), clinician, admin, or ministry.';
COMMENT ON COLUMN profiles.union_name IS 'Bangladesh administrative union (lowest level).';
COMMENT ON COLUMN profiles.language_pref IS 'Preferred language for UI and AI responses: bn (Bangla) or en (English).';

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_phone ON profiles(phone);
CREATE INDEX idx_profiles_division_district ON profiles(division, district);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);

-- Granular consent management (GDPR/PDPA)
CREATE TABLE consents (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type consent_type NOT NULL,
  granted      BOOLEAN      NOT NULL DEFAULT FALSE,
  granted_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  ip_hash      TEXT,        -- SHA-256 hash, never store raw IP
  version      TEXT         NOT NULL DEFAULT '1.0',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, consent_type, version)
);

COMMENT ON TABLE consents IS 'Granular, revocable consent records per user per consent type. GDPR/Bangladesh PDPA compliant.';
COMMENT ON COLUMN consents.ip_hash IS 'SHA-256 hash of IP address at consent time. Raw IP is never stored.';
COMMENT ON COLUMN consents.version IS 'Version of the consent/privacy policy text that was presented.';

CREATE INDEX idx_consents_user_id ON consents(user_id);
CREATE INDEX idx_consents_type ON consents(consent_type);
CREATE INDEX idx_consents_granted ON consents(granted);

-- Immutable audit log (append-only, no updates or deletes allowed)
CREATE TABLE audit_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  action           TEXT        NOT NULL,
  table_name       TEXT        NOT NULL,
  record_id        UUID,
  old_data         JSONB,
  new_data         JSONB,
  ip_hash          TEXT,
  user_agent_hash  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Immutable append-only audit log. RLS prevents UPDATE and DELETE. 7-year retention enforced at storage level.';
COMMENT ON COLUMN audit_logs.old_data IS 'Snapshot of row before change (NULL for inserts).';
COMMENT ON COLUMN audit_logs.new_data IS 'Snapshot of row after change (NULL for deletes).';

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================================================================
-- CARE GRAPH - PATIENTS & CLINICAL
-- =============================================================================

CREATE TABLE patients (
  id                        UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                UUID       NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  patient_code              TEXT       NOT NULL UNIQUE,  -- e.g. SHT-2026-000001
  blood_type                TEXT,
  height_cm                 FLOAT,
  weight_kg                 FLOAT,
  bmi                       FLOAT GENERATED ALWAYS AS (
                              CASE WHEN height_cm > 0 AND weight_kg > 0
                              THEN weight_kg / POWER(height_cm / 100.0, 2)
                              ELSE NULL END
                            ) STORED,
  allergies                 TEXT[],
  chronic_conditions        TEXT[],
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  emergency_contact_relation TEXT,
  care_graph_version        INT        NOT NULL DEFAULT 1,
  last_risk_score           FLOAT,
  last_risk_band            risk_band,
  last_risk_scored_at       TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE patients IS 'Core patient record. One-to-one with profiles where role=patient. BMI is auto-computed.';
COMMENT ON COLUMN patients.patient_code IS 'Human-readable unique patient identifier. Format: SHT-YYYY-NNNNNN.';
COMMENT ON COLUMN patients.care_graph_version IS 'Optimistic-locking version counter for care graph updates.';
COMMENT ON COLUMN patients.last_risk_band IS 'Most recent Drishti risk band for triage display.';

CREATE TRIGGER set_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_patients_profile_id ON patients(profile_id);
CREATE INDEX idx_patients_last_risk_band ON patients(last_risk_band);
CREATE INDEX idx_patients_patient_code ON patients(patient_code);

-- Pregnancy tracking
CREATE TABLE pregnancies (
  id                   UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp_date             DATE             NOT NULL,
  edd                  DATE GENERATED ALWAYS AS (lmp_date + 280) STORED,
  gestational_age_weeks INT,
  trimester            trimester,
  gravida              INT,
  para                 INT,
  anc_count            INT              NOT NULL DEFAULT 0,
  status               pregnancy_status NOT NULL DEFAULT 'active',
  delivery_date        DATE,
  delivery_type        TEXT,
  birth_weight_grams   INT,
  facility_id          UUID,            -- FK added after facilities table; see ALTER TABLE below
  notes                TEXT,
  created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pregnancies IS 'Tracks each pregnancy episode. EDD, gestational age, and trimester are auto-computed from LMP.';
COMMENT ON COLUMN pregnancies.gravida IS 'Total number of pregnancies including current.';
COMMENT ON COLUMN pregnancies.para IS 'Number of pregnancies that resulted in a birth past 20 weeks.';

CREATE TRIGGER set_pregnancies_updated_at
  BEFORE UPDATE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Auto-compute gestational_age_weeks and trimester on insert/update
-- (cannot use GENERATED ALWAYS AS because NOW() is volatile)
CREATE OR REPLACE FUNCTION trigger_compute_gestational_age()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  weeks INT;
BEGIN
  weeks := EXTRACT(DAY FROM NOW() - NEW.lmp_date)::INT / 7;
  NEW.gestational_age_weeks := GREATEST(weeks, 0);
  NEW.trimester := CASE
    WHEN weeks < 13 THEN '1'::trimester
    WHEN weeks < 27 THEN '2'::trimester
    ELSE '3'::trimester
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compute_gestational_age
  BEFORE INSERT OR UPDATE OF lmp_date ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION trigger_compute_gestational_age();

CREATE INDEX idx_pregnancies_patient_id ON pregnancies(patient_id);
CREATE INDEX idx_pregnancies_status ON pregnancies(status);
CREATE INDEX idx_pregnancies_edd ON pregnancies(edd);

-- Clinical vitals
CREATE TABLE vitals (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                  UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id                UUID         REFERENCES pregnancies(id) ON DELETE SET NULL,
  recorded_by                 UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  source                      vital_source NOT NULL DEFAULT 'manual',
  systolic_bp                 INT,
  diastolic_bp                INT,
  pulse_bpm                   INT,
  temperature_c               FLOAT,
  respiratory_rate            INT,
  oxygen_saturation           FLOAT,
  weight_kg                   FLOAT,
  fetal_heart_rate            INT,
  fundal_height_cm            FLOAT,
  hemoglobin                  FLOAT,
  blood_glucose_fasting       FLOAT,
  blood_glucose_postprandial  FLOAT,
  urine_protein               urine_protein_level,
  recorded_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vitals IS 'Clinical vital signs. Supports manual entry, wearable sync, CHW recording, and automated device streams.';
COMMENT ON COLUMN vitals.urine_protein IS 'Dipstick urine protein result. Critical for pre-eclampsia detection.';

CREATE INDEX idx_vitals_patient_id ON vitals(patient_id);
CREATE INDEX idx_vitals_pregnancy_id ON vitals(pregnancy_id);
CREATE INDEX idx_vitals_recorded_at ON vitals(recorded_at);
CREATE INDEX idx_vitals_source ON vitals(source);

-- Symptom reports
CREATE TABLE symptoms (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id    UUID             REFERENCES pregnancies(id) ON DELETE SET NULL,
  reported_by     UUID             NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  symptom_text    TEXT             NOT NULL,
  symptom_text_bn TEXT,
  severity        symptom_severity NOT NULL DEFAULT 'mild',
  onset_at        TIMESTAMPTZ,
  duration_hours  FLOAT,
  is_red_flag     BOOLEAN          NOT NULL DEFAULT FALSE,
  red_flag_type   TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE symptoms IS 'Patient-reported and clinician-recorded symptoms. Red flags trigger SOS escalation in Maa AI.';
COMMENT ON COLUMN symptoms.is_red_flag IS 'TRUE if symptom matches a red-flag pattern (e.g. severe headache + visual disturbance = pre-eclampsia risk).';

CREATE INDEX idx_symptoms_patient_id ON symptoms(patient_id);
CREATE INDEX idx_symptoms_pregnancy_id ON symptoms(pregnancy_id);
CREATE INDEX idx_symptoms_is_red_flag ON symptoms(is_red_flag);
CREATE INDEX idx_symptoms_created_at ON symptoms(created_at);
CREATE INDEX idx_symptoms_text_trgm ON symptoms USING GIN(symptom_text gin_trgm_ops);

-- Conditions / diagnoses
CREATE TABLE conditions (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_name   TEXT             NOT NULL,
  icd10_code       TEXT,
  condition_name_bn TEXT,
  status           condition_status NOT NULL DEFAULT 'active',
  diagnosed_at     TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  diagnosed_by     UUID             REFERENCES profiles(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE conditions IS 'Patient condition/diagnosis registry. ICD-10 coded for interoperability.';

CREATE TRIGGER set_conditions_updated_at
  BEFORE UPDATE ON conditions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_conditions_patient_id ON conditions(patient_id);
CREATE INDEX idx_conditions_icd10 ON conditions(icd10_code);
CREATE INDEX idx_conditions_status ON conditions(status);

-- Medications
CREATE TABLE medications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id  UUID        REFERENCES pregnancies(id) ON DELETE SET NULL,
  drug_name     TEXT        NOT NULL,
  drug_name_bn  TEXT,
  dosage        TEXT,
  frequency     TEXT,
  route         TEXT,
  prescribed_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  start_date    DATE,
  end_date      DATE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE medications IS 'Medication and prescription records. Linked to pregnancy for drug-safety checks.';

CREATE TRIGGER set_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_medications_patient_id ON medications(patient_id);
CREATE INDEX idx_medications_pregnancy_id ON medications(pregnancy_id);
CREATE INDEX idx_medications_is_active ON medications(is_active);

-- Lab results (with S3-compatible storage reference)
CREATE TABLE lab_results (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id     UUID               REFERENCES pregnancies(id) ON DELETE SET NULL,
  test_name        TEXT               NOT NULL,
  test_name_bn     TEXT,
  result_value     TEXT,
  result_unit      TEXT,
  reference_range  TEXT,
  interpretation   lab_interpretation,
  collected_at     TIMESTAMPTZ,
  reported_at      TIMESTAMPTZ,
  facility_name    TEXT,
  notes            TEXT,
  storage_url      TEXT,   -- S3-compatible object URL (scanned report image)
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lab_results IS 'Lab test results including haemoglobin, blood glucose, urine, etc. storage_url points to S3-compatible object.';

CREATE INDEX idx_lab_results_patient_id ON lab_results(patient_id);
CREATE INDEX idx_lab_results_pregnancy_id ON lab_results(pregnancy_id);
CREATE INDEX idx_lab_results_interpretation ON lab_results(interpretation);
CREATE INDEX idx_lab_results_collected_at ON lab_results(collected_at);

-- =============================================================================
-- FACILITIES (referenced by pregnancies - declared early)
-- Note: facilities table DDL moved up to resolve FK reference from pregnancies.
-- The CREATE TABLE pregnancies above references facilities(id).
-- Supabase processes forward-references if run as a single transaction.
-- For safety, facilities is declared here and pregnancies above uses DEFERRABLE.
-- =============================================================================

CREATE TABLE facilities (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name     TEXT          NOT NULL,
  facility_name_bn  TEXT,
  facility_type     facility_type NOT NULL,
  division          TEXT,
  district          TEXT,
  upazila           TEXT,
  lat               FLOAT,
  lng               FLOAT,
  phone             TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE facilities IS 'Healthcare facility registry: upazila health complexes, district hospitals, community clinics, and private facilities.';

CREATE INDEX idx_facilities_district ON facilities(district, upazila);
CREATE INDEX idx_facilities_type ON facilities(facility_type);
CREATE INDEX idx_facilities_is_active ON facilities(is_active);

-- Deferred FK: pregnancies → facilities (facilities declared after pregnancies above)
ALTER TABLE pregnancies
  ADD CONSTRAINT fk_pregnancies_facility
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;

-- =============================================================================
-- MAA MODULE - Maternal Voice AI
-- =============================================================================

CREATE TABLE maa_conversations (
  id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                     UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id                   UUID         REFERENCES pregnancies(id) ON DELETE SET NULL,
  session_type                   session_type NOT NULL DEFAULT 'voice',
  started_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at                       TIMESTAMPTZ,
  turn_count                     INT          NOT NULL DEFAULT 0,
  summary                        TEXT,
  risk_flags_detected            TEXT[],
  escalated_to_sos               BOOLEAN      NOT NULL DEFAULT FALSE,
  conversation_summary_embedding vector(1536),
  created_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE maa_conversations IS 'Maa AI conversation sessions. Embeddings enable semantic search over past interactions for longitudinal context.';
COMMENT ON COLUMN maa_conversations.escalated_to_sos IS 'TRUE if this conversation triggered an SOS event.';
COMMENT ON COLUMN maa_conversations.conversation_summary_embedding IS 'pgvector embedding of conversation summary for RAG context retrieval.';

CREATE INDEX idx_maa_conversations_patient_id ON maa_conversations(patient_id);
CREATE INDEX idx_maa_conversations_pregnancy_id ON maa_conversations(pregnancy_id);
CREATE INDEX idx_maa_conversations_escalated ON maa_conversations(escalated_to_sos);
CREATE INDEX idx_maa_conversations_started_at ON maa_conversations(started_at);
CREATE INDEX idx_maa_conversations_embedding ON maa_conversations
  USING hnsw (conversation_summary_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Individual conversation messages
CREATE TABLE maa_messages (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       UUID           NOT NULL REFERENCES maa_conversations(id) ON DELETE CASCADE,
  role                  message_role   NOT NULL,
  content               TEXT,
  content_bn            TEXT,
  audio_storage_url     TEXT,           -- S3-compatible URL for voice audio
  transcript            TEXT,
  transcript_confidence FLOAT,
  language_detected     language_code,
  intent_detected       TEXT,
  rag_sources           JSONB,          -- [{chunk_id, score, source_name}]
  model_used            TEXT,
  tokens_used           INT,
  latency_ms            INT,
  safety_gate_passed    BOOLEAN         NOT NULL DEFAULT TRUE,
  red_flag_detected     BOOLEAN         NOT NULL DEFAULT FALSE,
  red_flag_type         TEXT,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE maa_messages IS 'Individual turns in a Maa conversation. Stores bilingual content, audio URL, RAG sources, and safety gate results.';
COMMENT ON COLUMN maa_messages.audio_storage_url IS 'S3-compatible object URL for the user voice audio. Requires voice_storage consent.';
COMMENT ON COLUMN maa_messages.rag_sources IS 'JSON array of knowledge chunks retrieved for this response.';
COMMENT ON COLUMN maa_messages.safety_gate_passed IS 'FALSE if content moderation blocked or modified the response.';

CREATE INDEX idx_maa_messages_conversation_id ON maa_messages(conversation_id);
CREATE INDEX idx_maa_messages_red_flag ON maa_messages(red_flag_detected);
CREATE INDEX idx_maa_messages_created_at ON maa_messages(created_at);

-- Raw voice session records (pre-conversation processing)
CREATE TABLE maa_voice_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id     UUID        REFERENCES maa_conversations(id) ON DELETE SET NULL,
  wake_word_detected  BOOLEAN     NOT NULL DEFAULT FALSE,
  audio_storage_url   TEXT,
  transcript          TEXT,
  whisper_model_used  TEXT,
  processing_ms       INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE maa_voice_sessions IS 'Raw voice session records. Captures wake-word events and pre-ASR audio before linking to a conversation.';

CREATE INDEX idx_maa_voice_sessions_patient_id ON maa_voice_sessions(patient_id);
CREATE INDEX idx_maa_voice_sessions_conversation_id ON maa_voice_sessions(conversation_id);

-- ANC checkup tracker
CREATE TABLE anc_checkups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnancy_id          UUID        NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
  patient_id            UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_date        DATE,
  completed_date        DATE,
  facility_id           UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  clinician_id          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  anc_number            INT,        -- 1, 2, 3, 4+ (WHO recommends ≥4 contacts)
  bp_checked            BOOLEAN     NOT NULL DEFAULT FALSE,
  weight_checked        BOOLEAN     NOT NULL DEFAULT FALSE,
  urine_tested          BOOLEAN     NOT NULL DEFAULT FALSE,
  blood_tested          BOOLEAN     NOT NULL DEFAULT FALSE,
  tetanus_given         BOOLEAN     NOT NULL DEFAULT FALSE,
  iron_folic_given      BOOLEAN     NOT NULL DEFAULT FALSE,
  counseling_done       BOOLEAN     NOT NULL DEFAULT FALSE,
  next_appointment_date DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE anc_checkups IS 'ANC (Antenatal Care) contact tracker. WHO recommends minimum 4 contacts during pregnancy.';
COMMENT ON COLUMN anc_checkups.anc_number IS 'Sequential ANC contact number. WHO 2016 guidelines recommend 8 contacts.';

CREATE INDEX idx_anc_checkups_pregnancy_id ON anc_checkups(pregnancy_id);
CREATE INDEX idx_anc_checkups_patient_id ON anc_checkups(patient_id);
CREATE INDEX idx_anc_checkups_scheduled_date ON anc_checkups(scheduled_date);

-- =============================================================================
-- SOS EVENTS
-- =============================================================================

CREATE TABLE sos_events (
  id                         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                 UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  triggered_by               UUID             NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  trigger_type               sos_trigger_type NOT NULL,
  location_lat               FLOAT,
  location_lng               FLOAT,
  location_accuracy_m        FLOAT,
  red_flag_signal            TEXT,
  status                     sos_status       NOT NULL DEFAULT 'triggered',
  ambulance_contact_notified BOOLEAN          NOT NULL DEFAULT FALSE,
  family_notified            BOOLEAN          NOT NULL DEFAULT FALSE,
  chw_notified               BOOLEAN          NOT NULL DEFAULT FALSE,
  clinician_notified         BOOLEAN          NOT NULL DEFAULT FALSE,
  resolved_at                TIMESTAMPTZ,
  resolution_notes           TEXT,
  created_at                 TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sos_events IS 'Emergency SOS events. Triggered by wake word, manual button, or AI red-flag detection. Coordinates multi-party notification.';
COMMENT ON COLUMN sos_events.red_flag_signal IS 'The specific red-flag that triggered SOS (e.g. severe_headache_visual_disturbance).';

CREATE INDEX idx_sos_events_patient_id ON sos_events(patient_id);
CREATE INDEX idx_sos_events_status ON sos_events(status);
CREATE INDEX idx_sos_events_created_at ON sos_events(created_at);

-- =============================================================================
-- SAATHI MODULE - Health Monitor + Telemedicine
-- =============================================================================

CREATE TABLE health_monitors (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_type  TEXT        NOT NULL,
  device_id    TEXT        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  paired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  UNIQUE (patient_id, device_id)
);

COMMENT ON TABLE health_monitors IS 'Wearable and IoT health monitoring device registry per patient.';

CREATE INDEX idx_health_monitors_patient_id ON health_monitors(patient_id);

-- High-frequency vitals stream from wearables
CREATE TABLE vitals_streaming (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  monitor_id       UUID        REFERENCES health_monitors(id) ON DELETE SET NULL,
  heart_rate       INT,
  spo2             FLOAT,
  steps            INT,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anomaly_detected BOOLEAN     NOT NULL DEFAULT FALSE,
  anomaly_type     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vitals_streaming IS 'High-frequency wearable vitals stream. Anomaly detection flags are set by the Saathi edge processor.';

CREATE INDEX idx_vitals_streaming_patient_id ON vitals_streaming(patient_id);
CREATE INDEX idx_vitals_streaming_recorded_at ON vitals_streaming(recorded_at);
CREATE INDEX idx_vitals_streaming_anomaly ON vitals_streaming(anomaly_detected);

-- Telemedicine sessions
CREATE TABLE teleconsult_sessions (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id     UUID               NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  chw_id           UUID               REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  status           teleconsult_status NOT NULL DEFAULT 'scheduled',
  video_room_id    TEXT,
  chief_complaint  TEXT,
  clinical_notes   TEXT,
  prescription_url TEXT,              -- S3-compatible URL
  follow_up_date   DATE,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE teleconsult_sessions IS 'Saathi telemedicine video consultation sessions. CHW can co-join as facilitator for rural patients.';

CREATE INDEX idx_teleconsult_patient_id ON teleconsult_sessions(patient_id);
CREATE INDEX idx_teleconsult_clinician_id ON teleconsult_sessions(clinician_id);
CREATE INDEX idx_teleconsult_status ON teleconsult_sessions(status);
CREATE INDEX idx_teleconsult_scheduled_at ON teleconsult_sessions(scheduled_at);

-- =============================================================================
-- DRISHTI MODULE - Risk Q&A Engine
-- =============================================================================

CREATE TABLE risk_assessments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id        UUID        REFERENCES pregnancies(id) ON DELETE SET NULL,
  session_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  questions_answered  JSONB,      -- [{question_key, answer}]
  raw_responses       JSONB,
  xgboost_features    JSONB,
  risk_score          FLOAT,
  risk_band           risk_band,
  shap_attributions   JSONB,      -- [{feature, shap_value}] for explainability
  top_conditions      JSONB,      -- [{condition, probability}]
  recommended_action  TEXT,
  assessed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE risk_assessments IS 'Drishti risk assessment outputs. XGBoost features and SHAP attributions stored for model auditing and explainability.';
COMMENT ON COLUMN risk_assessments.shap_attributions IS 'SHAP feature importance values for each prediction. Required for clinical explainability.';

CREATE INDEX idx_risk_assessments_patient_id ON risk_assessments(patient_id);
CREATE INDEX idx_risk_assessments_pregnancy_id ON risk_assessments(pregnancy_id);
CREATE INDEX idx_risk_assessments_risk_band ON risk_assessments(risk_band);
CREATE INDEX idx_risk_assessments_assessed_at ON risk_assessments(assessed_at);

-- Risk question bank
CREATE TABLE risk_questions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key     TEXT        NOT NULL UNIQUE,
  question_text_en TEXT        NOT NULL,
  question_text_bn TEXT        NOT NULL,
  question_order   INT,
  options          JSONB,      -- [{value, label_en, label_bn}]
  cohort_tags      TEXT[],     -- e.g. ['pregnancy', 'anaemia', 'diabetes']
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE risk_questions IS 'Drishti adaptive questionnaire bank. Questions are bilingual and cohort-tagged for dynamic form generation.';

CREATE INDEX idx_risk_questions_is_active ON risk_questions(is_active);
CREATE INDEX idx_risk_questions_cohort ON risk_questions USING GIN(cohort_tags);

-- =============================================================================
-- PUSHTI MODULE - Nutrition + Rewards
-- =============================================================================

CREATE TABLE nutrition_profiles (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id      UUID               REFERENCES pregnancies(id) ON DELETE SET NULL,
  condition         nutrition_condition NOT NULL,
  division          TEXT,
  district          TEXT,
  calorie_target    INT,
  protein_g         FLOAT,
  iron_mg           FLOAT,
  folic_acid_mcg    FLOAT,
  calcium_mg        FLOAT,
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nutrition_profiles IS 'Pushti personalised nutrition targets. Localised by division/district for regional food availability.';

CREATE TRIGGER set_nutrition_profiles_updated_at
  BEFORE UPDATE ON nutrition_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_nutrition_profiles_patient_id ON nutrition_profiles(patient_id);
CREATE INDEX idx_nutrition_profiles_condition ON nutrition_profiles(condition);

-- Weekly meal plans
CREATE TABLE meal_plans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nutrition_profile_id UUID        NOT NULL REFERENCES nutrition_profiles(id) ON DELETE CASCADE,
  patient_id           UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  plan_week            INT         NOT NULL,  -- ISO week number
  plan_data            JSONB       NOT NULL,  -- [{day, meals: [{type, foods, calories}]}]
  generated_by_model   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meal_plans IS 'AI-generated weekly meal plans. plan_data contains localised Bangladeshi foods.';

CREATE INDEX idx_meal_plans_patient_id ON meal_plans(patient_id);
CREATE INDEX idx_meal_plans_profile_id ON meal_plans(nutrition_profile_id);

-- Meal logs
CREATE TABLE meal_logs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  meal_type          meal_type   NOT NULL,
  food_items         JSONB,      -- [{name, name_bn, quantity, unit, calories}]
  estimated_calories FLOAT,
  logged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meal_logs_patient_id ON meal_logs(patient_id);
CREATE INDEX idx_meal_logs_logged_at ON meal_logs(logged_at);

-- Reward / gamification points
CREATE TABLE reward_points (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID              NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  points       INT               NOT NULL,
  action_type  reward_action_type NOT NULL,
  reference_id UUID,             -- FK to the triggering record (anc_checkup, meal_log, etc.)
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reward_points IS 'Pushti gamification points. Positive reinforcement for health behaviours.';

CREATE INDEX idx_reward_points_patient_id ON reward_points(patient_id);
CREATE INDEX idx_reward_points_action_type ON reward_points(action_type);

-- =============================================================================
-- KNOWLEDGE CORPUS (RAG - Shetu OS)
-- =============================================================================

CREATE TABLE knowledge_sources (
  id            UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name   TEXT                  NOT NULL,
  source_url    TEXT,
  source_type   knowledge_source_type NOT NULL,
  version       TEXT,
  language      knowledge_language    NOT NULL DEFAULT 'en',
  last_crawled_at TIMESTAMPTZ,
  chunk_count   INT                   NOT NULL DEFAULT 0,
  is_active     BOOLEAN               NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE knowledge_sources IS 'Shetu OS RAG knowledge base sources: WHO guidelines, DGHS protocols, BDHS data, research papers, food databases.';

CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(source_type);
CREATE INDEX idx_knowledge_sources_is_active ON knowledge_sources(is_active);

-- Knowledge chunks with embeddings (RAG backbone)
CREATE TABLE knowledge_chunks (
  id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID               NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_text     TEXT               NOT NULL,
  chunk_text_bn  TEXT,
  chunk_hash     TEXT               NOT NULL UNIQUE,  -- SHA-256 to deduplicate
  chunk_index    INT                NOT NULL,
  section_title  TEXT,
  cohort_tags    TEXT[],
  language       knowledge_language NOT NULL DEFAULT 'en',
  token_count    INT,
  source_url     TEXT,
  ingested_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  embedding      vector(1536)       NOT NULL,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE knowledge_chunks IS 'RAG knowledge chunks with 1536-dim embeddings. IVFFlat index for production-scale similarity search.';
COMMENT ON COLUMN knowledge_chunks.chunk_hash IS 'SHA-256 of chunk_text for deduplication during re-ingestion.';
COMMENT ON COLUMN knowledge_chunks.embedding IS '1536-dimensional embedding vector (OpenAI text-embedding-3-small or equivalent).';

CREATE INDEX idx_knowledge_chunks_source_id ON knowledge_chunks(source_id);
CREATE INDEX idx_knowledge_chunks_cohort ON knowledge_chunks USING GIN(cohort_tags);
CREATE INDEX idx_knowledge_chunks_language ON knowledge_chunks(language);
-- IVFFlat index for high-throughput retrieval (adjust lists based on chunk count)
CREATE INDEX idx_knowledge_chunks_embedding_ivfflat ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
-- HNSW index for low-latency exact nearest-neighbour (used by Maa real-time path)
CREATE INDEX idx_knowledge_chunks_embedding_hnsw ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RAG retrieval audit
CREATE TABLE rag_retrievals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text       TEXT        NOT NULL,
  query_embedding  vector(1536),
  retrieved_chunks JSONB,      -- [{chunk_id, score}]
  reranked_chunks  JSONB,      -- [{chunk_id, rerank_score}]
  conversation_id  UUID        REFERENCES maa_conversations(id) ON DELETE SET NULL,
  model_used       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rag_retrievals IS 'Audit log of every RAG retrieval. Supports model evaluation, chunk quality analysis, and bias auditing.';

CREATE INDEX idx_rag_retrievals_conversation_id ON rag_retrievals(conversation_id);
CREATE INDEX idx_rag_retrievals_created_at ON rag_retrievals(created_at);

-- =============================================================================
-- CHW - Community Health Workers
-- =============================================================================

CREATE TABLE chw_profiles (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  chw_code             TEXT        NOT NULL UNIQUE,
  facility_id          UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  division             TEXT,
  district             TEXT,
  upazila              TEXT,
  union_name           TEXT,
  active_patients_count INT        NOT NULL DEFAULT 0,
  last_visit_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chw_profiles IS 'Community Health Worker (Shasthya Seba) extended profile. CHWs are the primary field touchpoint.';

CREATE INDEX idx_chw_profiles_profile_id ON chw_profiles(profile_id);
CREATE INDEX idx_chw_profiles_district ON chw_profiles(district, upazila);

-- CHW patient assignment roster
CREATE TABLE chw_patient_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id       UUID        NOT NULL REFERENCES chw_profiles(id) ON DELETE CASCADE,
  patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (chw_id, patient_id, assigned_at)
);

COMMENT ON TABLE chw_patient_assignments IS 'Tracks which CHW is responsible for which patients. Historical assignments retained for audit.';

CREATE INDEX idx_chw_assignments_chw_id ON chw_patient_assignments(chw_id);
CREATE INDEX idx_chw_assignments_patient_id ON chw_patient_assignments(patient_id);
CREATE INDEX idx_chw_assignments_is_active ON chw_patient_assignments(is_active);

-- CHW field visits
CREATE TABLE chw_visits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id           UUID        NOT NULL REFERENCES chw_profiles(id) ON DELETE CASCADE,
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_type       visit_type  NOT NULL DEFAULT 'routine',
  scheduled_at     TIMESTAMPTZ,
  visited_at       TIMESTAMPTZ,
  location_lat     FLOAT,
  location_lng     FLOAT,
  visit_notes      TEXT,
  vitals_recorded  BOOLEAN     NOT NULL DEFAULT FALSE,
  medications_checked BOOLEAN  NOT NULL DEFAULT FALSE,
  referral_needed  BOOLEAN     NOT NULL DEFAULT FALSE,
  referral_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chw_visits_chw_id ON chw_visits(chw_id);
CREATE INDEX idx_chw_visits_patient_id ON chw_visits(patient_id);
CREATE INDEX idx_chw_visits_visited_at ON chw_visits(visited_at);

-- =============================================================================
-- PROVIDERS
-- =============================================================================

-- Clinicians
CREATE TABLE clinicians (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  bmdc_number           TEXT        UNIQUE,   -- Bangladesh Medical & Dental Council reg. number
  specialty             TEXT,
  facility_id           UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  is_nrb                BOOLEAN     NOT NULL DEFAULT FALSE,  -- Non-Resident Bangladeshi
  telemedicine_available BOOLEAN    NOT NULL DEFAULT FALSE,
  available_hours       JSONB,      -- [{day, start_time, end_time}]
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinicians IS 'Clinician extended profile. BMDC number is the official Bangladesh medical registration.';
COMMENT ON COLUMN clinicians.is_nrb IS 'Non-Resident Bangladeshi clinicians volunteering via Saathi telemedicine.';

CREATE INDEX idx_clinicians_profile_id ON clinicians(profile_id);
CREATE INDEX idx_clinicians_facility_id ON clinicians(facility_id);
CREATE INDEX idx_clinicians_telemedicine ON clinicians(telemedicine_available);

-- Appointments
CREATE TABLE appointments (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id     UUID               REFERENCES clinicians(id) ON DELETE SET NULL,
  facility_id      UUID               REFERENCES facilities(id) ON DELETE SET NULL,
  appointment_type appointment_type   NOT NULL,
  scheduled_at     TIMESTAMPTZ        NOT NULL,
  status           appointment_status NOT NULL DEFAULT 'booked',
  notes            TEXT,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_clinician_id ON appointments(clinician_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);

-- =============================================================================
-- AI AUDIT & OPS
-- =============================================================================

CREATE TABLE ai_invocations (
  id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID           REFERENCES profiles(id) ON DELETE SET NULL,
  module             ai_module      NOT NULL,
  model_provider     model_provider NOT NULL,
  model_name         TEXT           NOT NULL,
  prompt_hash        TEXT,          -- SHA-256 of prompt for PII-free logging
  input_tokens       INT,
  output_tokens      INT,
  cached_tokens      INT,
  latency_ms         INT,
  cost_usd           FLOAT,
  conversation_id    UUID           REFERENCES maa_conversations(id) ON DELETE SET NULL,
  safety_gate_passed BOOLEAN        NOT NULL DEFAULT TRUE,
  hitl_flagged       BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_invocations IS 'Cost, latency, and safety audit log for every AI model call across all Shetu modules.';
COMMENT ON COLUMN ai_invocations.prompt_hash IS 'SHA-256 of prompt text. Never store raw prompts to avoid PII leakage in ops logs.';
COMMENT ON COLUMN ai_invocations.hitl_flagged IS 'Human-in-the-loop review flagged by safety gate.';

CREATE INDEX idx_ai_invocations_user_id ON ai_invocations(user_id);
CREATE INDEX idx_ai_invocations_module ON ai_invocations(module);
CREATE INDEX idx_ai_invocations_model_provider ON ai_invocations(model_provider);
CREATE INDEX idx_ai_invocations_hitl_flagged ON ai_invocations(hitl_flagged);
CREATE INDEX idx_ai_invocations_created_at ON ai_invocations(created_at);

-- Human-in-the-loop review queue
CREATE TABLE hitl_reviews (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_invocation_id  UUID         NOT NULL REFERENCES ai_invocations(id) ON DELETE CASCADE,
  flagged_reason    TEXT         NOT NULL,
  reviewer_id       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  decision          hitl_decision,
  feedback          TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hitl_reviews IS 'HITL review queue for AI outputs flagged by safety gates. Required for clinical AI governance.';

CREATE INDEX idx_hitl_reviews_invocation_id ON hitl_reviews(ai_invocation_id);
CREATE INDEX idx_hitl_reviews_reviewer_id ON hitl_reviews(reviewer_id);
CREATE INDEX idx_hitl_reviews_decision ON hitl_reviews(decision);

-- =============================================================================
-- OFFLINE SYNC (Lite Module)
-- =============================================================================

CREATE TABLE sync_queue (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   TEXT          NOT NULL,
  user_id     UUID          REFERENCES profiles(id) ON DELETE CASCADE,
  record_type TEXT          NOT NULL,
  record_id   UUID          NOT NULL,
  operation   sync_operation NOT NULL,
  payload     JSONB         NOT NULL,
  sync_status sync_status   NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  synced_at   TIMESTAMPTZ
);

COMMENT ON TABLE sync_queue IS 'Offline-first sync queue for Lite module. Devices in rural areas with intermittent connectivity queue writes here.';

CREATE INDEX idx_sync_queue_device_id ON sync_queue(device_id);
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_queue_sync_status ON sync_queue(sync_status);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all patient-facing tables
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptoms                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results               ENABLE ROW LEVEL SECURITY;
ALTER TABLE maa_conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maa_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE maa_voice_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE anc_checkups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_monitors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals_streaming          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teleconsult_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_points             ENABLE ROW LEVEL SECURITY;
ALTER TABLE chw_patient_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chw_visits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_invocations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_reviews              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue                ENABLE ROW LEVEL SECURITY;

-- -------------------------
-- Helper: get current user's role
-- -------------------------
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is admin or ministry
CREATE OR REPLACE FUNCTION is_admin_or_ministry()
RETURNS BOOLEAN AS $$
  SELECT auth_user_role() IN ('admin', 'ministry');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get patient_id for current user (if role=patient)
CREATE OR REPLACE FUNCTION my_patient_id()
RETURNS UUID AS $$
  SELECT id FROM patients WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current CHW is assigned to a patient
CREATE OR REPLACE FUNCTION chw_has_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM chw_patient_assignments cpa
    JOIN chw_profiles cp ON cp.id = cpa.chw_id
    WHERE cp.profile_id = auth.uid()
      AND cpa.patient_id = p_patient_id
      AND cpa.is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current clinician has a session with a patient
CREATE OR REPLACE FUNCTION clinician_has_patient(p_patient_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM teleconsult_sessions ts
    WHERE ts.clinician_id = auth.uid()
      AND ts.patient_id = p_patient_id
  ) OR EXISTS (
    SELECT 1 FROM appointments a
    JOIN clinicians c ON c.id = a.clinician_id
    WHERE c.profile_id = auth.uid()
      AND a.patient_id = p_patient_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -------------------------
-- profiles RLS
-- -------------------------
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid() OR is_admin_or_ministry());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid() OR is_admin_or_ministry());

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- -------------------------
-- consents RLS
-- -------------------------
CREATE POLICY "consents_select" ON consents
  FOR SELECT USING (user_id = auth.uid() OR is_admin_or_ministry());

CREATE POLICY "consents_insert_own" ON consents
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "consents_update_own" ON consents
  FOR UPDATE USING (user_id = auth.uid());

-- -------------------------
-- audit_logs RLS (append-only: SELECT + INSERT only)
-- -------------------------
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (user_id = auth.uid() OR is_admin_or_ministry());

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (TRUE);  -- service role writes, no user restriction

-- No UPDATE or DELETE policies = immutable for non-superusers

-- -------------------------
-- Macro: patient data access pattern
-- patients can read own; CHWs see assigned; clinicians see their patients; admins see all
-- -------------------------

-- patients
CREATE POLICY "patients_select" ON patients FOR SELECT USING (
  profile_id = auth.uid()
  OR is_admin_or_ministry()
  OR chw_has_patient(id)
  OR clinician_has_patient(id)
);
CREATE POLICY "patients_update_own" ON patients FOR UPDATE
  USING (profile_id = auth.uid() OR is_admin_or_ministry());
CREATE POLICY "patients_insert" ON patients FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR is_admin_or_ministry());

-- pregnancies
CREATE POLICY "pregnancies_select" ON pregnancies FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "pregnancies_insert" ON pregnancies FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);
CREATE POLICY "pregnancies_update" ON pregnancies FOR UPDATE USING (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- vitals
CREATE POLICY "vitals_select" ON vitals FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "vitals_insert" ON vitals FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- symptoms
CREATE POLICY "symptoms_select" ON symptoms FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "symptoms_insert" ON symptoms FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- conditions
CREATE POLICY "conditions_select" ON conditions FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "conditions_insert" ON conditions FOR INSERT WITH CHECK (
  is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- medications
CREATE POLICY "medications_select" ON medications FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "medications_insert" ON medications FOR INSERT WITH CHECK (
  is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- lab_results
CREATE POLICY "lab_results_select" ON lab_results FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "lab_results_insert" ON lab_results FOR INSERT WITH CHECK (
  is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- maa_conversations
CREATE POLICY "maa_conversations_select" ON maa_conversations FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "maa_conversations_insert" ON maa_conversations FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);

-- maa_messages (access via conversation ownership)
CREATE POLICY "maa_messages_select" ON maa_messages FOR SELECT USING (
  is_admin_or_ministry()
  OR EXISTS (
    SELECT 1 FROM maa_conversations mc
    WHERE mc.id = conversation_id
      AND (mc.patient_id = my_patient_id()
           OR chw_has_patient(mc.patient_id)
           OR clinician_has_patient(mc.patient_id))
  )
);
CREATE POLICY "maa_messages_insert" ON maa_messages FOR INSERT WITH CHECK (
  is_admin_or_ministry()
  OR EXISTS (
    SELECT 1 FROM maa_conversations mc
    WHERE mc.id = conversation_id AND mc.patient_id = my_patient_id()
  )
);

-- maa_voice_sessions
CREATE POLICY "maa_voice_sessions_select" ON maa_voice_sessions FOR SELECT USING (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);
CREATE POLICY "maa_voice_sessions_insert" ON maa_voice_sessions FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);

-- anc_checkups
CREATE POLICY "anc_checkups_select" ON anc_checkups FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "anc_checkups_insert" ON anc_checkups FOR INSERT WITH CHECK (
  is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- sos_events
CREATE POLICY "sos_events_select" ON sos_events FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "sos_events_insert" ON sos_events FOR INSERT WITH CHECK (TRUE); -- any auth user can trigger SOS
CREATE POLICY "sos_events_update" ON sos_events FOR UPDATE USING (
  is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- health_monitors
CREATE POLICY "health_monitors_select" ON health_monitors FOR SELECT USING (
  patient_id = my_patient_id() OR is_admin_or_ministry() OR chw_has_patient(patient_id)
);
CREATE POLICY "health_monitors_insert" ON health_monitors FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);

-- vitals_streaming
CREATE POLICY "vitals_streaming_select" ON vitals_streaming FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "vitals_streaming_insert" ON vitals_streaming FOR INSERT WITH CHECK (TRUE); -- wearable service role

-- teleconsult_sessions
CREATE POLICY "teleconsult_sessions_select" ON teleconsult_sessions FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR clinician_id = auth.uid()
  OR chw_id = auth.uid()
);
CREATE POLICY "teleconsult_sessions_insert" ON teleconsult_sessions FOR INSERT WITH CHECK (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR clinician_id = auth.uid()
);

-- risk_assessments
CREATE POLICY "risk_assessments_select" ON risk_assessments FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
  OR clinician_has_patient(patient_id)
);
CREATE POLICY "risk_assessments_insert" ON risk_assessments FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id) OR clinician_has_patient(patient_id)
);

-- nutrition_profiles
CREATE POLICY "nutrition_profiles_select" ON nutrition_profiles FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR chw_has_patient(patient_id)
);
CREATE POLICY "nutrition_profiles_insert" ON nutrition_profiles FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry() OR chw_has_patient(patient_id)
);

-- meal_plans
CREATE POLICY "meal_plans_select" ON meal_plans FOR SELECT USING (
  patient_id = my_patient_id() OR is_admin_or_ministry() OR chw_has_patient(patient_id)
);
CREATE POLICY "meal_plans_insert" ON meal_plans FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);

-- meal_logs
CREATE POLICY "meal_logs_select" ON meal_logs FOR SELECT USING (
  patient_id = my_patient_id() OR is_admin_or_ministry() OR chw_has_patient(patient_id)
);
CREATE POLICY "meal_logs_insert" ON meal_logs FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);

-- reward_points
CREATE POLICY "reward_points_select" ON reward_points FOR SELECT USING (
  patient_id = my_patient_id() OR is_admin_or_ministry()
);
CREATE POLICY "reward_points_insert" ON reward_points FOR INSERT WITH CHECK (TRUE); -- service role writes

-- chw_patient_assignments
CREATE POLICY "chw_assignments_select" ON chw_patient_assignments FOR SELECT USING (
  is_admin_or_ministry()
  OR patient_id = my_patient_id()
  OR EXISTS (SELECT 1 FROM chw_profiles cp WHERE cp.id = chw_id AND cp.profile_id = auth.uid())
);

-- chw_visits
CREATE POLICY "chw_visits_select" ON chw_visits FOR SELECT USING (
  is_admin_or_ministry()
  OR patient_id = my_patient_id()
  OR EXISTS (SELECT 1 FROM chw_profiles cp WHERE cp.id = chw_id AND cp.profile_id = auth.uid())
);
CREATE POLICY "chw_visits_insert" ON chw_visits FOR INSERT WITH CHECK (
  is_admin_or_ministry()
  OR EXISTS (SELECT 1 FROM chw_profiles cp WHERE cp.id = chw_id AND cp.profile_id = auth.uid())
);

-- appointments
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  patient_id = my_patient_id()
  OR is_admin_or_ministry()
  OR EXISTS (SELECT 1 FROM clinicians c WHERE c.id = clinician_id AND c.profile_id = auth.uid())
  OR chw_has_patient(patient_id)
);
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  patient_id = my_patient_id() OR is_admin_or_ministry()
    OR chw_has_patient(patient_id)
);

-- ai_invocations
CREATE POLICY "ai_invocations_select" ON ai_invocations FOR SELECT USING (
  user_id = auth.uid() OR is_admin_or_ministry()
);
CREATE POLICY "ai_invocations_insert" ON ai_invocations FOR INSERT WITH CHECK (TRUE); -- service role

-- hitl_reviews
CREATE POLICY "hitl_reviews_select" ON hitl_reviews FOR SELECT USING (
  is_admin_or_ministry()
  OR reviewer_id = auth.uid()
);
CREATE POLICY "hitl_reviews_update" ON hitl_reviews FOR UPDATE USING (
  reviewer_id = auth.uid() OR is_admin_or_ministry()
);

-- sync_queue
CREATE POLICY "sync_queue_select" ON sync_queue FOR SELECT USING (
  user_id = auth.uid() OR is_admin_or_ministry()
);
CREATE POLICY "sync_queue_insert" ON sync_queue FOR INSERT WITH CHECK (
  user_id = auth.uid() OR is_admin_or_ministry()
);
CREATE POLICY "sync_queue_update" ON sync_queue FOR UPDATE USING (
  user_id = auth.uid() OR is_admin_or_ministry()
);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active pregnancies with patient and risk info
CREATE OR REPLACE VIEW active_pregnancies AS
SELECT
  p.id                      AS pregnancy_id,
  p.patient_id,
  pat.patient_code,
  pr.full_name              AS patient_name,
  pr.phone                  AS patient_phone,
  pr.division,
  pr.district,
  pr.upazila,
  p.lmp_date,
  p.edd,
  p.gestational_age_weeks,
  p.trimester,
  p.gravida,
  p.para,
  p.anc_count,
  pat.last_risk_band,
  pat.last_risk_score,
  pat.last_risk_scored_at,
  p.created_at
FROM pregnancies p
JOIN patients pat    ON pat.id = p.patient_id
JOIN profiles pr     ON pr.id = pat.profile_id
WHERE p.status = 'active'
  AND pr.is_active = TRUE;

COMMENT ON VIEW active_pregnancies IS 'Consolidated view of all active pregnancies with patient details and current risk band.';

-- Patient risk summary for clinical dashboard
CREATE OR REPLACE VIEW patient_risk_summary AS
SELECT
  pat.id                    AS patient_id,
  pat.patient_code,
  pr.full_name,
  pr.phone,
  pr.division,
  pr.district,
  pr.upazila,
  pat.last_risk_band,
  pat.last_risk_score,
  pat.last_risk_scored_at,
  preg.id                   AS active_pregnancy_id,
  preg.gestational_age_weeks,
  preg.edd,
  preg.anc_count,
  (SELECT COUNT(*) FROM sos_events s
   WHERE s.patient_id = pat.id
     AND s.created_at > NOW() - INTERVAL '30 days')
                            AS sos_events_last_30d,
  (SELECT MAX(v.recorded_at) FROM vitals v
   WHERE v.patient_id = pat.id)
                            AS last_vitals_at,
  pr.is_active
FROM patients pat
JOIN profiles pr             ON pr.id = pat.profile_id
LEFT JOIN pregnancies preg   ON preg.patient_id = pat.id AND preg.status = 'active';

COMMENT ON VIEW patient_risk_summary IS 'Clinical triage dashboard view. Shows risk band, gestational age, recent SOS events, and last vitals for all patients.';

-- =============================================================================
-- DATA RETENTION POLICY (7-year clinical data)
-- Uses pg_cron to enforce retention on non-clinical operational logs
-- =============================================================================

-- Purge streaming vitals older than 1 year (high-volume, non-clinical)
-- Clinical vitals table retains data indefinitely (7-year retention policy)
SELECT cron.schedule(
  'purge_vitals_streaming',
  '0 2 1 * *',   -- 1st of every month at 02:00
  $$
    DELETE FROM vitals_streaming
    WHERE created_at < NOW() - INTERVAL '1 year'
      AND anomaly_detected = FALSE;
  $$
);

-- Purge resolved sync_queue entries older than 90 days
SELECT cron.schedule(
  'purge_sync_queue',
  '0 3 * * 0',   -- every Sunday at 03:00
  $$
    DELETE FROM sync_queue
    WHERE sync_status IN ('synced', 'failed')
      AND created_at < NOW() - INTERVAL '90 days';
  $$
);

-- =============================================================================
-- AUDIT LOG TRIGGER (auto-insert into audit_logs on patient table changes)
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  _old_data JSONB := NULL;
  _new_data JSONB := NULL;
  _user_id  UUID  := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    _old_data := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    _new_data := to_jsonb(NEW);
  ELSE
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs(user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    _user_id,
    TG_OP,
    TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW)->>'id')::UUID, (to_jsonb(OLD)->>'id')::UUID),
    _old_data,
    _new_data
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to core clinical tables
CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_pregnancies
  AFTER INSERT OR UPDATE OR DELETE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_vitals
  AFTER INSERT OR UPDATE OR DELETE ON vitals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_medications
  AFTER INSERT OR UPDATE OR DELETE ON medications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_conditions
  AFTER INSERT OR UPDATE OR DELETE ON conditions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_sos_events
  AFTER INSERT OR UPDATE OR DELETE ON sos_events
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_teleconsult_sessions
  AFTER INSERT OR UPDATE OR DELETE ON teleconsult_sessions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_consents
  AFTER INSERT OR UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- =============================================================================
-- GRANT SERVICE ROLE BYPASS (Supabase service_role bypasses RLS)
-- Application code using the service role key can access all tables.
-- Anon and authenticated roles are governed by RLS above.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT ON consents TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON patients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pregnancies TO authenticated;
GRANT SELECT, INSERT ON vitals TO authenticated;
GRANT SELECT, INSERT ON symptoms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON conditions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON medications TO authenticated;
GRANT SELECT, INSERT ON lab_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON maa_conversations TO authenticated;
GRANT SELECT, INSERT ON maa_messages TO authenticated;
GRANT SELECT, INSERT ON maa_voice_sessions TO authenticated;
GRANT SELECT, INSERT ON anc_checkups TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sos_events TO authenticated;
GRANT SELECT, INSERT ON health_monitors TO authenticated;
GRANT SELECT, INSERT ON vitals_streaming TO authenticated;
GRANT SELECT, INSERT, UPDATE ON teleconsult_sessions TO authenticated;
GRANT SELECT, INSERT ON risk_assessments TO authenticated;
GRANT SELECT ON risk_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nutrition_profiles TO authenticated;
GRANT SELECT, INSERT ON meal_plans TO authenticated;
GRANT SELECT, INSERT ON meal_logs TO authenticated;
GRANT SELECT, INSERT ON reward_points TO authenticated;
GRANT SELECT ON knowledge_sources TO authenticated;
GRANT SELECT ON knowledge_chunks TO authenticated;
GRANT SELECT, INSERT ON rag_retrievals TO authenticated;
GRANT SELECT ON chw_profiles TO authenticated;
GRANT SELECT ON chw_patient_assignments TO authenticated;
GRANT SELECT, INSERT ON chw_visits TO authenticated;
GRANT SELECT ON facilities TO authenticated;
GRANT SELECT ON clinicians TO authenticated;
GRANT SELECT, INSERT, UPDATE ON appointments TO authenticated;
GRANT SELECT, INSERT ON ai_invocations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hitl_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sync_queue TO authenticated;

-- =============================================================================
-- END OF SHETU DDL SCHEMA v1.0.0
-- =============================================================================
