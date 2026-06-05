-- =============================================================================
-- SHETU MAA MODULE — Supabase SQL Schema
-- Maternal Health Companion: Chatbot · Vitals Check · Emergency SOS
-- =============================================================================
-- Prerequisites: Run auth_test.sql first (profiles + user_role enum must exist)
-- Run this entire file in the Supabase SQL Editor
-- All CREATE statements are idempotent (safe to re-run)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- SHARED UTILITY TRIGGER FUNCTION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- ENUMS  (DO blocks make each one idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE risk_band          AS ENUM ('low','watch','elevated','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE pregnancy_status   AS ENUM ('active','delivered','lost','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE trimester          AS ENUM ('1','2','3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE urine_protein_level AS ENUM ('none','trace','1+','2+','3+','4+');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE symptom_severity   AS ENUM ('mild','moderate','severe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE session_type       AS ENUM ('voice','text','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE message_role       AS ENUM ('user','assistant','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE language_code      AS ENUM ('bn','en','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sos_trigger_type   AS ENUM ('wake_word','manual','clinician','chw');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sos_status         AS ENUM ('triggered','acknowledged','ambulance_dispatched','resolved','false_alarm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE vital_source       AS ENUM ('manual','wearable','chw','auto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- TABLE: patients
-- One-to-one extension of profiles (role = 'mother' / 'patient')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                 UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  patient_code               TEXT        NOT NULL UNIQUE,   -- MAA-YYYY-XXXXXX
  blood_type                 TEXT,
  height_cm                  FLOAT,
  weight_kg                  FLOAT,
  allergies                  TEXT[],
  emergency_contact_name     TEXT,
  emergency_contact_phone    TEXT,
  emergency_contact_relation TEXT,
  last_risk_band             risk_band,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_patients_profile_id ON patients(profile_id);

-- ---------------------------------------------------------------------------
-- TABLE: pregnancies
-- EDD is auto-computed (LMP + 280 days). Gestational age & trimester are set
-- by a BEFORE INSERT/UPDATE trigger because NOW() is volatile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pregnancies (
  id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp_date              DATE             NOT NULL,
  edd                   DATE             GENERATED ALWAYS AS (lmp_date + 280) STORED,
  gestational_age_weeks INT,
  trimester             trimester,
  gravida               INT,
  para                  INT,
  anc_count             INT              NOT NULL DEFAULT 0,
  status                pregnancy_status NOT NULL DEFAULT 'active',
  delivery_date         DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION trigger_compute_gestational_age()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE weeks INT;
BEGIN
  weeks := GREATEST(EXTRACT(DAY FROM NOW() - NEW.lmp_date)::INT / 7, 0);
  NEW.gestational_age_weeks := weeks;
  NEW.trimester := CASE
    WHEN weeks < 13 THEN '1'::trimester
    WHEN weeks < 27 THEN '2'::trimester
    ELSE                  '3'::trimester
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER compute_gestational_age
  BEFORE INSERT OR UPDATE OF lmp_date ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION trigger_compute_gestational_age();

CREATE OR REPLACE TRIGGER set_pregnancies_updated_at
  BEFORE UPDATE ON pregnancies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pregnancies_patient_id ON pregnancies(patient_id);
CREATE INDEX IF NOT EXISTS idx_pregnancies_status     ON pregnancies(status);
CREATE INDEX IF NOT EXISTS idx_pregnancies_edd        ON pregnancies(edd);

-- ---------------------------------------------------------------------------
-- TABLE: vitals
-- Clinical vital signs. has_flags / flag_details added by Maa for quick UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals (
  id                       UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id               UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id             UUID               REFERENCES pregnancies(id) ON DELETE SET NULL,
  recorded_by              UUID               NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  source                   vital_source       NOT NULL DEFAULT 'manual',
  systolic_bp              INT,
  diastolic_bp             INT,
  pulse_bpm                INT,
  temperature_c            FLOAT,
  respiratory_rate         INT,
  oxygen_saturation        FLOAT,
  weight_kg                FLOAT,
  fetal_heart_rate         INT,
  hemoglobin               FLOAT,
  blood_glucose_fasting    FLOAT,
  urine_protein            urine_protein_level,
  has_flags                BOOLEAN            NOT NULL DEFAULT FALSE,
  flag_details             JSONB,             -- [{type, message, severity}]
  recorded_at              TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_id  ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at ON vitals(recorded_at);
CREATE INDEX IF NOT EXISTS idx_vitals_has_flags   ON vitals(has_flags);

-- ---------------------------------------------------------------------------
-- TABLE: symptoms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS symptoms (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id    UUID             REFERENCES pregnancies(id) ON DELETE SET NULL,
  reported_by     UUID             NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  symptom_text    TEXT             NOT NULL,
  severity        symptom_severity NOT NULL DEFAULT 'mild',
  is_red_flag     BOOLEAN          NOT NULL DEFAULT FALSE,
  red_flag_type   TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_symptoms_patient_id   ON symptoms(patient_id);
CREATE INDEX IF NOT EXISTS idx_symptoms_is_red_flag  ON symptoms(is_red_flag);

-- ---------------------------------------------------------------------------
-- TABLE: anc_checkups
-- ANC (Antenatal Care) visit tracker. WHO recommends ≥ 8 contacts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anc_checkups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnancy_id          UUID        NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
  patient_id            UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_date        DATE,
  completed_date        DATE,
  anc_number            INT,        -- 1, 2, 3 … WHO 2016: 8 contacts recommended
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

CREATE INDEX IF NOT EXISTS idx_anc_checkups_pregnancy_id ON anc_checkups(pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_anc_checkups_patient_id   ON anc_checkups(patient_id);

-- ---------------------------------------------------------------------------
-- TABLE: maa_conversations
-- One session = one chat with Maa AI. escalated_to_sos = TRUE if red flag fired.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maa_conversations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id        UUID         REFERENCES pregnancies(id) ON DELETE SET NULL,
  session_type        session_type NOT NULL DEFAULT 'text',
  started_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  turn_count          INT          NOT NULL DEFAULT 0,
  summary             TEXT,
  risk_flags_detected TEXT[],
  escalated_to_sos    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maa_conversations_patient_id  ON maa_conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_maa_conversations_started_at  ON maa_conversations(started_at);
CREATE INDEX IF NOT EXISTS idx_maa_conversations_escalated   ON maa_conversations(escalated_to_sos);

-- ---------------------------------------------------------------------------
-- TABLE: maa_messages
-- Individual turns in a Maa AI conversation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maa_messages (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID         NOT NULL REFERENCES maa_conversations(id) ON DELETE CASCADE,
  role               message_role NOT NULL,
  content            TEXT         NOT NULL,
  language_detected  language_code,
  model_used         TEXT,
  tokens_used        INT,
  latency_ms         INT,
  safety_gate_passed BOOLEAN      NOT NULL DEFAULT TRUE,
  red_flag_detected  BOOLEAN      NOT NULL DEFAULT FALSE,
  red_flag_type      TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maa_messages_conversation_id ON maa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_maa_messages_red_flag        ON maa_messages(red_flag_detected);
CREATE INDEX IF NOT EXISTS idx_maa_messages_created_at      ON maa_messages(created_at);

-- ---------------------------------------------------------------------------
-- TABLE: sos_events
-- Emergency events triggered by wake-word, SOS button, or AI red-flag.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sos_events (
  id                         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                 UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  triggered_by               UUID             NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  trigger_type               sos_trigger_type NOT NULL DEFAULT 'manual',
  location_lat               FLOAT,
  location_lng               FLOAT,
  location_accuracy_m        FLOAT,
  red_flag_signal            TEXT,
  status                     sos_status       NOT NULL DEFAULT 'triggered',
  ambulance_contact_notified BOOLEAN          NOT NULL DEFAULT FALSE,
  family_notified            BOOLEAN          NOT NULL DEFAULT FALSE,
  chw_notified               BOOLEAN          NOT NULL DEFAULT FALSE,
  resolved_at                TIMESTAMPTZ,
  resolution_notes           TEXT,
  created_at                 TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_events_patient_id  ON sos_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_status      ON sos_events(status);
CREATE INDEX IF NOT EXISTS idx_sos_events_created_at  ON sos_events(created_at);

-- ---------------------------------------------------------------------------
-- TABLE: emergency_contacts
-- Multiple emergency contacts per patient (for SOS feature).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  relation   TEXT,
  is_primary BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_patient_id ON emergency_contacts(patient_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptoms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE anc_checkups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE maa_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maa_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "patients_own"            ON patients;
DROP POLICY IF EXISTS "pregnancies_own"         ON pregnancies;
DROP POLICY IF EXISTS "vitals_own"              ON vitals;
DROP POLICY IF EXISTS "symptoms_own"            ON symptoms;
DROP POLICY IF EXISTS "anc_checkups_own"        ON anc_checkups;
DROP POLICY IF EXISTS "maa_conversations_own"   ON maa_conversations;
DROP POLICY IF EXISTS "maa_messages_own"        ON maa_messages;
DROP POLICY IF EXISTS "sos_events_own"          ON sos_events;
DROP POLICY IF EXISTS "emergency_contacts_own"  ON emergency_contacts;

-- patients: user can access their own record only
CREATE POLICY "patients_own" ON patients
  FOR ALL USING (profile_id = auth.uid());

-- pregnancies: via patient ownership
CREATE POLICY "pregnancies_own" ON pregnancies
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- vitals: via patient ownership
CREATE POLICY "vitals_own" ON vitals
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- symptoms: via patient ownership
CREATE POLICY "symptoms_own" ON symptoms
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- anc_checkups: via patient ownership
CREATE POLICY "anc_checkups_own" ON anc_checkups
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- maa_conversations: via patient ownership
CREATE POLICY "maa_conversations_own" ON maa_conversations
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- maa_messages: via conversation → patient ownership
CREATE POLICY "maa_messages_own" ON maa_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT mc.id FROM maa_conversations mc
      JOIN patients p ON p.id = mc.patient_id
      WHERE p.profile_id = auth.uid()
    )
  );

-- sos_events: via patient ownership
CREATE POLICY "sos_events_own" ON sos_events
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- emergency_contacts: via patient ownership
CREATE POLICY "emergency_contacts_own" ON emergency_contacts
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
  );

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON patients           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pregnancies        TO authenticated;
GRANT SELECT, INSERT                 ON vitals             TO authenticated;
GRANT SELECT, INSERT                 ON symptoms           TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON anc_checkups       TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON maa_conversations  TO authenticated;
GRANT SELECT, INSERT                 ON maa_messages       TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON sos_events         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON emergency_contacts TO authenticated;

-- =============================================================================
-- DONE
-- Tables: patients · pregnancies · vitals · symptoms · anc_checkups
--         maa_conversations · maa_messages · sos_events · emergency_contacts
-- =============================================================================
