-- =============================================================================
-- SHETU SAATHI MODULE — PATIENT Schema
-- Role: patient (General Health User — NOT a pregnant mother)
-- Features: Health Profile · Daily Check-in · Vitals · Symptom Checker ·
--           Teleconsult · Appointments · Goals · CHW Support · Health Blog ·
--           Lab Results · Medications · Wearables · Vitals Summary Reports
-- =============================================================================
-- Prerequisites (run in order before this file):
--   1. auth_test.sql        (profiles table + user_role enum)
--   2. fix_permissions.sql  (grants + supabase_auth_admin fix)
--   3. maa_schema.sql       (patients · vitals · symptoms · emergency_contacts)
-- =============================================================================
-- What this file adds (15 tables · 10 enums · 57 indexes · 21 policies):
--   Patient-exclusive new tables:
--     patient_health_profiles · daily_health_checkins · health_goals
--   Shared Saathi infrastructure (patient-scoped, zero pregnancy columns):
--     facilities · clinicians · chw_profiles · chw_patient_assignments ·
--     chw_visits · health_monitors · vitals_streaming · teleconsult_sessions ·
--     appointments · conditions · medications · lab_results ·
--     vitals_summary_reports · health_articles · article_bookmarks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- SHARED UTILITY TRIGGER (safe to replace)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- ENUMS  (all idempotent DO blocks)
-- ---------------------------------------------------------------------------

-- Shared Saathi enums
DO $$ BEGIN CREATE TYPE teleconsult_status AS ENUM
  ('scheduled','in_progress','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE facility_type AS ENUM
  ('upazila_health_complex','district_hospital','community_clinic','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE appointment_type AS ENUM
  ('teleconsult','routine','emergency','follow_up','lab_test');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE appointment_status AS ENUM
  ('booked','confirmed','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE visit_type AS ENUM
  ('routine','emergency','follow_up','home_visit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE condition_status AS ENUM
  ('active','resolved','chronic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE lab_interpretation AS ENUM
  ('normal','abnormal','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE report_period_type AS ENUM
  ('weekly','monthly','teleconsult','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE article_category AS ENUM
  ('general_health','chronic_disease','nutrition','mental_health',
   'exercise_wellness','emergency_signs','medicine_guide','lifestyle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Patient-exclusive enums
DO $$ BEGIN CREATE TYPE activity_level AS ENUM
  ('sedentary','lightly_active','moderately_active','very_active','athlete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE feeling_level AS ENUM
  ('excellent','good','fair','poor','very_poor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE health_goal_type AS ENUM
  ('daily_steps','weight_loss','weight_gain','blood_pressure',
   'blood_glucose','exercise_minutes','sleep_hours','water_intake');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- PART 1 — PATIENT-EXCLUSIVE TABLES
-- Tables that apply only to general patients (no equivalent in maa_schema)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: patient_health_profiles
-- One-to-one extended health record for a general patient.
-- Captures lifestyle, chronic conditions, and biometrics beyond what
-- the base patients table holds.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_health_profiles (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID           NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Biometrics ────────────────────────────────────────────────────────────
  height_cm           FLOAT,
  weight_kg           FLOAT,
  bmi                 FLOAT GENERATED ALWAYS AS (
                        CASE WHEN height_cm > 0 AND weight_kg > 0
                        THEN ROUND((weight_kg / POWER(height_cm / 100.0, 2))::NUMERIC, 1)::FLOAT
                        ELSE NULL END
                      ) STORED,
  blood_group         TEXT,          -- 'A+', 'B-', 'O+', 'AB+', etc.

  -- ── Lifestyle ─────────────────────────────────────────────────────────────
  activity_level      activity_level,
  is_smoker           BOOLEAN        NOT NULL DEFAULT FALSE,
  is_diabetic         BOOLEAN        NOT NULL DEFAULT FALSE,
  is_hypertensive     BOOLEAN        NOT NULL DEFAULT FALSE,
  has_heart_disease   BOOLEAN        NOT NULL DEFAULT FALSE,
  has_kidney_disease  BOOLEAN        NOT NULL DEFAULT FALSE,
  other_conditions    TEXT[],        -- free-form chronic conditions list

  -- ── Allergies & medications ───────────────────────────────────────────────
  known_allergies     TEXT[],
  current_medications TEXT[],        -- quick-entry list (detailed in medications table)

  -- ── Emergency contact ─────────────────────────────────────────────────────
  emergency_contact_name     TEXT,
  emergency_contact_phone    TEXT,
  emergency_contact_relation TEXT,

  -- ── Daily targets (referenced by health_goals) ───────────────────────────
  daily_step_target   INT            NOT NULL DEFAULT 8000,
  daily_water_ml      INT            NOT NULL DEFAULT 2000,
  sleep_target_hours  FLOAT          NOT NULL DEFAULT 7.5,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  profile_complete    BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_patient_health_profiles_updated_at
  BEFORE UPDATE ON patient_health_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_php_patient_id     ON patient_health_profiles(patient_id);
CREATE INDEX IF NOT EXISTS idx_php_is_diabetic    ON patient_health_profiles(is_diabetic);
CREATE INDEX IF NOT EXISTS idx_php_is_hypertensive ON patient_health_profiles(is_hypertensive);

-- ---------------------------------------------------------------------------
-- TABLE: daily_health_checkins
-- Samsung Health-style daily wellness check-in for general patients.
-- One record per patient per calendar day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_health_checkins (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID          NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  checkin_date     DATE          NOT NULL,

  -- ── Subjective wellness ───────────────────────────────────────────────────
  overall_feeling  feeling_level,
  energy_level     INT           CHECK (energy_level BETWEEN 1 AND 10),
  pain_level       INT           CHECK (pain_level   BETWEEN 0 AND 10),
  stress_level     INT           CHECK (stress_level BETWEEN 1 AND 10),
  mood_notes       TEXT,

  -- ── Sleep ─────────────────────────────────────────────────────────────────
  sleep_hours      FLOAT,
  sleep_quality    INT           CHECK (sleep_quality BETWEEN 1 AND 5),

  -- ── Activity ──────────────────────────────────────────────────────────────
  steps_today      INT,
  exercise_minutes INT,
  water_intake_ml  INT,

  -- ── Symptoms today (quick flags — details go in symptoms table) ───────────
  had_headache     BOOLEAN       NOT NULL DEFAULT FALSE,
  had_fever        BOOLEAN       NOT NULL DEFAULT FALSE,
  had_nausea       BOOLEAN       NOT NULL DEFAULT FALSE,
  had_chest_pain   BOOLEAN       NOT NULL DEFAULT FALSE,
  had_dizziness    BOOLEAN       NOT NULL DEFAULT FALSE,
  other_symptoms   TEXT[],

  -- ── Meta ──────────────────────────────────────────────────────────────────
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (patient_id, checkin_date)            -- one check-in per day
);

CREATE OR REPLACE TRIGGER set_daily_health_checkins_updated_at
  BEFORE UPDATE ON daily_health_checkins
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dhc_patient_id    ON daily_health_checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_dhc_checkin_date  ON daily_health_checkins(checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_dhc_feeling       ON daily_health_checkins(overall_feeling);
CREATE INDEX IF NOT EXISTS idx_dhc_pain          ON daily_health_checkins(pain_level);

-- ---------------------------------------------------------------------------
-- TABLE: health_goals
-- Personal health targets the patient sets (steps, weight, BP, glucose, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_goals (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  goal_type       health_goal_type NOT NULL,
  goal_label      TEXT             NOT NULL,   -- e.g. "Walk 10,000 steps a day"
  goal_label_bn   TEXT,
  target_value    FLOAT            NOT NULL,   -- numeric target
  target_unit     TEXT             NOT NULL,   -- e.g. 'steps', 'kg', 'mmHg', 'mg/dL', 'hours'
  current_value   FLOAT,                       -- latest measured value
  start_date      DATE             NOT NULL DEFAULT CURRENT_DATE,
  deadline        DATE,
  is_active       BOOLEAN          NOT NULL DEFAULT TRUE,
  is_achieved     BOOLEAN          NOT NULL DEFAULT FALSE,
  achieved_at     TIMESTAMPTZ,
  reminder_enabled BOOLEAN         NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_health_goals_updated_at
  BEFORE UPDATE ON health_goals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_hg_patient_id  ON health_goals(patient_id);
CREATE INDEX IF NOT EXISTS idx_hg_goal_type   ON health_goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_hg_is_active   ON health_goals(is_active);
CREATE INDEX IF NOT EXISTS idx_hg_is_achieved ON health_goals(is_achieved);

-- =============================================================================
-- PART 2 — SHARED SAATHI INFRASTRUCTURE (patient-scoped, no pregnancy columns)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: facilities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facilities (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name    TEXT          NOT NULL,
  facility_name_bn TEXT,
  facility_type    facility_type NOT NULL,
  division         TEXT,
  district         TEXT,
  upazila          TEXT,
  address          TEXT,
  lat              FLOAT,
  lng              FLOAT,
  phone            TEXT,
  email            TEXT,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_facilities_updated_at
  BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_facilities_district  ON facilities(district, upazila);
CREATE INDEX IF NOT EXISTS idx_facilities_type      ON facilities(facility_type);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON facilities(is_active);

-- ---------------------------------------------------------------------------
-- TABLE: clinicians
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinicians (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id             UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  bmdc_number            TEXT        UNIQUE,
  specialty              TEXT,
  facility_id            UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  is_nrb                 BOOLEAN     NOT NULL DEFAULT FALSE,
  telemedicine_available BOOLEAN     NOT NULL DEFAULT FALSE,
  available_hours        JSONB,      -- [{day, start_time, end_time}]
  bio                    TEXT,
  profile_photo_url      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_clinicians_updated_at
  BEFORE UPDATE ON clinicians
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_clinicians_profile_id   ON clinicians(profile_id);
CREATE INDEX IF NOT EXISTS idx_clinicians_facility_id  ON clinicians(facility_id);
CREATE INDEX IF NOT EXISTS idx_clinicians_telemedicine ON clinicians(telemedicine_available);
CREATE INDEX IF NOT EXISTS idx_clinicians_is_nrb       ON clinicians(is_nrb);

-- ---------------------------------------------------------------------------
-- TABLE: chw_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chw_profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  chw_code              TEXT        NOT NULL UNIQUE,
  facility_id           UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  division              TEXT,
  district              TEXT,
  upazila               TEXT,
  union_name            TEXT,
  active_patients_count INT         NOT NULL DEFAULT 0,
  last_visit_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_chw_profiles_updated_at
  BEFORE UPDATE ON chw_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_chw_profiles_profile_id ON chw_profiles(profile_id);
CREATE INDEX IF NOT EXISTS idx_chw_profiles_district   ON chw_profiles(district, upazila);

-- ---------------------------------------------------------------------------
-- TABLE: chw_patient_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chw_patient_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id        UUID        NOT NULL REFERENCES chw_profiles(id) ON DELETE CASCADE,
  patient_id    UUID        NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  notes         TEXT,
  UNIQUE (chw_id, patient_id, assigned_at)
);

CREATE INDEX IF NOT EXISTS idx_chw_assignments_chw_id     ON chw_patient_assignments(chw_id);
CREATE INDEX IF NOT EXISTS idx_chw_assignments_patient_id ON chw_patient_assignments(patient_id);
CREATE INDEX IF NOT EXISTS idx_chw_assignments_is_active  ON chw_patient_assignments(is_active);

-- ---------------------------------------------------------------------------
-- TABLE: chw_visits  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chw_visits (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id               UUID        NOT NULL REFERENCES chw_profiles(id) ON DELETE CASCADE,
  patient_id           UUID        NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
  visit_type           visit_type  NOT NULL DEFAULT 'routine',
  scheduled_at         TIMESTAMPTZ,
  visited_at           TIMESTAMPTZ,
  location_lat         FLOAT,
  location_lng         FLOAT,
  visit_notes          TEXT,
  vitals_recorded      BOOLEAN     NOT NULL DEFAULT FALSE,
  medications_checked  BOOLEAN     NOT NULL DEFAULT FALSE,
  referral_needed      BOOLEAN     NOT NULL DEFAULT FALSE,
  referral_reason      TEXT,
  referral_facility_id UUID        REFERENCES facilities(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chw_visits_chw_id     ON chw_visits(chw_id);
CREATE INDEX IF NOT EXISTS idx_chw_visits_patient_id ON chw_visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_chw_visits_visited_at ON chw_visits(visited_at);

-- ---------------------------------------------------------------------------
-- TABLE: health_monitors  (wearable devices)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_monitors (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_type  TEXT        NOT NULL,
  device_id    TEXT        NOT NULL,
  device_name  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  paired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  UNIQUE (patient_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_health_monitors_patient_id ON health_monitors(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_monitors_is_active  ON health_monitors(is_active);

-- ---------------------------------------------------------------------------
-- TABLE: vitals_streaming  (high-frequency wearable stream)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_streaming (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES patients(id)         ON DELETE CASCADE,
  monitor_id       UUID        REFERENCES health_monitors(id)           ON DELETE SET NULL,
  heart_rate       INT,
  spo2             FLOAT,
  steps            INT,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anomaly_detected BOOLEAN     NOT NULL DEFAULT FALSE,
  anomaly_type     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vitals_streaming_patient_id  ON vitals_streaming(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_streaming_recorded_at ON vitals_streaming(recorded_at);
CREATE INDEX IF NOT EXISTS idx_vitals_streaming_anomaly     ON vitals_streaming(anomaly_detected);

-- ---------------------------------------------------------------------------
-- TABLE: teleconsult_sessions  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teleconsult_sessions (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  clinician_id     UUID               NOT NULL REFERENCES profiles(id)   ON DELETE RESTRICT,
  chw_id           UUID               REFERENCES profiles(id)            ON DELETE SET NULL,
  facility_id      UUID               REFERENCES facilities(id)          ON DELETE SET NULL,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  status           teleconsult_status NOT NULL DEFAULT 'scheduled',
  video_room_id    TEXT,
  chief_complaint  TEXT,
  clinical_notes   TEXT,
  prescription_url TEXT,
  follow_up_date   DATE,
  follow_up_notes  TEXT,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_teleconsult_sessions_updated_at
  BEFORE UPDATE ON teleconsult_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_teleconsult_patient_id   ON teleconsult_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_teleconsult_clinician_id ON teleconsult_sessions(clinician_id);
CREATE INDEX IF NOT EXISTS idx_teleconsult_status       ON teleconsult_sessions(status);
CREATE INDEX IF NOT EXISTS idx_teleconsult_scheduled_at ON teleconsult_sessions(scheduled_at);

-- ---------------------------------------------------------------------------
-- TABLE: appointments  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  clinician_id     UUID               REFERENCES clinicians(id)          ON DELETE SET NULL,
  facility_id      UUID               REFERENCES facilities(id)          ON DELETE SET NULL,
  appointment_type appointment_type   NOT NULL,
  scheduled_at     TIMESTAMPTZ        NOT NULL,
  status           appointment_status NOT NULL DEFAULT 'booked',
  notes            TEXT,
  reminder_sent    BOOLEAN            NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id   ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinician_id ON appointments(clinician_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status       ON appointments(status);

-- ---------------------------------------------------------------------------
-- TABLE: conditions  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conditions (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID             NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  condition_name    TEXT             NOT NULL,
  condition_name_bn TEXT,
  icd10_code        TEXT,
  status            condition_status NOT NULL DEFAULT 'active',
  diagnosed_at      TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  diagnosed_by      UUID             REFERENCES profiles(id)            ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_conditions_updated_at
  BEFORE UPDATE ON conditions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_conditions_patient_id ON conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_conditions_icd10      ON conditions(icd10_code);
CREATE INDEX IF NOT EXISTS idx_conditions_status     ON conditions(status);
CREATE INDEX IF NOT EXISTS idx_conditions_name_trgm
  ON conditions USING GIN(condition_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- TABLE: medications  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  drug_name     TEXT        NOT NULL,
  drug_name_bn  TEXT,
  dosage        TEXT,
  frequency     TEXT,
  route         TEXT,
  prescribed_by UUID        REFERENCES profiles(id)            ON DELETE SET NULL,
  start_date    DATE,
  end_date      DATE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_is_active  ON medications(is_active);

-- ---------------------------------------------------------------------------
-- TABLE: lab_results  (no pregnancy_id — patient-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_results (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID               NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  test_name        TEXT               NOT NULL,
  test_name_bn     TEXT,
  result_value     TEXT,
  result_unit      TEXT,
  reference_range  TEXT,
  interpretation   lab_interpretation,
  collected_at     TIMESTAMPTZ,
  reported_at      TIMESTAMPTZ,
  facility_id      UUID               REFERENCES facilities(id)          ON DELETE SET NULL,
  facility_name    TEXT,
  ordered_by       UUID               REFERENCES profiles(id)            ON DELETE SET NULL,
  storage_url      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id     ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_interpretation ON lab_results(interpretation);
CREATE INDEX IF NOT EXISTS idx_lab_results_collected_at   ON lab_results(collected_at);

-- ---------------------------------------------------------------------------
-- TABLE: vitals_summary_reports
-- AI-generated period report from vitals + streaming + flags.
-- No pregnancy_id — patient-only version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_summary_reports (
  id                        UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Report period ─────────────────────────────────────────────────────────
  period_type               report_period_type NOT NULL,
  period_start              DATE               NOT NULL,
  period_end                DATE               NOT NULL,

  -- ── Manual vitals aggregates (vitals table) ───────────────────────────────
  vitals_count              INT                NOT NULL DEFAULT 0,
  avg_systolic_bp           FLOAT,
  avg_diastolic_bp          FLOAT,
  min_systolic_bp           INT,
  max_systolic_bp           INT,
  min_diastolic_bp          INT,
  max_diastolic_bp          INT,
  avg_pulse_bpm             FLOAT,
  min_pulse_bpm             INT,
  max_pulse_bpm             INT,
  avg_temperature_c         FLOAT,
  avg_weight_kg             FLOAT,
  weight_change_kg          FLOAT,

  -- ── Wearable streaming aggregates (vitals_streaming table) ───────────────
  streaming_readings_count  INT                NOT NULL DEFAULT 0,
  streaming_anomalies_count INT                NOT NULL DEFAULT 0,
  anomaly_types             TEXT[],
  avg_heart_rate_stream     FLOAT,
  avg_spo2_stream           FLOAT,
  total_steps               INT,

  -- ── Daily check-in aggregates (daily_health_checkins table) ──────────────
  checkins_count            INT                NOT NULL DEFAULT 0,
  avg_energy_level          FLOAT,
  avg_pain_level            FLOAT,
  avg_sleep_hours           FLOAT,
  total_exercise_minutes    INT,

  -- ── Flag summary ──────────────────────────────────────────────────────────
  flagged_vitals_count      INT                NOT NULL DEFAULT 0,
  flags_breakdown           JSONB,             -- [{type, count, severity, first_at, last_at}]

  -- ── Overall risk ──────────────────────────────────────────────────────────
  overall_risk_band         risk_band,
  risk_factors              TEXT[],

  -- ── AI analysis ───────────────────────────────────────────────────────────
  ai_summary                TEXT,
  ai_summary_bn             TEXT,
  ai_recommendations        TEXT[],
  ai_alerts                 TEXT[],
  generated_by_model        TEXT,
  generation_latency_ms     INT,

  -- ── Linked teleconsult ────────────────────────────────────────────────────
  teleconsult_id            UUID               REFERENCES teleconsult_sessions(id) ON DELETE SET NULL,

  -- ── Clinician review ──────────────────────────────────────────────────────
  reviewed_by               UUID               REFERENCES profiles(id)  ON DELETE SET NULL,
  reviewed_at               TIMESTAMPTZ,
  clinician_notes           TEXT,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at                TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_vitals_summary_reports_updated_at
  BEFORE UPDATE ON vitals_summary_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_vsr_patient_id   ON vitals_summary_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_vsr_period_type  ON vitals_summary_reports(period_type);
CREATE INDEX IF NOT EXISTS idx_vsr_period_start ON vitals_summary_reports(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_vsr_risk_band    ON vitals_summary_reports(overall_risk_band);
CREATE INDEX IF NOT EXISTS idx_vsr_created_at   ON vitals_summary_reports(created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: health_articles  (patient-category focus)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_articles (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT             NOT NULL,
  title_bn        TEXT,
  slug            TEXT             NOT NULL UNIQUE,
  category        article_category NOT NULL,
  content         TEXT             NOT NULL,
  content_bn      TEXT,
  summary         TEXT,
  summary_bn      TEXT,
  author_name     TEXT,
  author_role     TEXT,
  tags            TEXT[],
  cover_image_url TEXT,
  read_time_mins  INT,
  is_published    BOOLEAN          NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_health_articles_updated_at
  BEFORE UPDATE ON health_articles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_health_articles_category     ON health_articles(category);
CREATE INDEX IF NOT EXISTS idx_health_articles_is_published ON health_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_health_articles_published_at ON health_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_articles_tags
  ON health_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_health_articles_title_trgm
  ON health_articles USING GIN(title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- TABLE: article_bookmarks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_bookmarks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        NOT NULL REFERENCES patients(id)        ON DELETE CASCADE,
  article_id UUID        NOT NULL REFERENCES health_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_bookmarks_patient_id ON article_bookmarks(patient_id);
CREATE INDEX IF NOT EXISTS idx_article_bookmarks_article_id ON article_bookmarks(article_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE patient_health_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_health_checkins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinicians                ENABLE ROW LEVEL SECURITY;
ALTER TABLE chw_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chw_patient_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chw_visits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_monitors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals_streaming          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teleconsult_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals_summary_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_articles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_bookmarks         ENABLE ROW LEVEL SECURITY;

-- Drop before recreating (idempotent)
DROP POLICY IF EXISTS "php_own"                  ON patient_health_profiles;
DROP POLICY IF EXISTS "dhc_own"                  ON daily_health_checkins;
DROP POLICY IF EXISTS "hg_own"                   ON health_goals;
DROP POLICY IF EXISTS "facilities_read"          ON facilities;
DROP POLICY IF EXISTS "clinicians_read"          ON clinicians;
DROP POLICY IF EXISTS "clinicians_own"           ON clinicians;
DROP POLICY IF EXISTS "chw_profiles_read"        ON chw_profiles;
DROP POLICY IF EXISTS "chw_profiles_own"         ON chw_profiles;
DROP POLICY IF EXISTS "chw_assignments_select"   ON chw_patient_assignments;
DROP POLICY IF EXISTS "chw_assignments_manage"   ON chw_patient_assignments;
DROP POLICY IF EXISTS "chw_visits_select"        ON chw_visits;
DROP POLICY IF EXISTS "chw_visits_insert"        ON chw_visits;
DROP POLICY IF EXISTS "health_monitors_own"      ON health_monitors;
DROP POLICY IF EXISTS "vitals_streaming_select"  ON vitals_streaming;
DROP POLICY IF EXISTS "vitals_streaming_insert"  ON vitals_streaming;
DROP POLICY IF EXISTS "teleconsult_own"          ON teleconsult_sessions;
DROP POLICY IF EXISTS "appointments_own"         ON appointments;
DROP POLICY IF EXISTS "conditions_own"           ON conditions;
DROP POLICY IF EXISTS "medications_own"          ON medications;
DROP POLICY IF EXISTS "lab_results_own"          ON lab_results;
DROP POLICY IF EXISTS "vsr_own"                  ON vitals_summary_reports;
DROP POLICY IF EXISTS "health_articles_published" ON health_articles;
DROP POLICY IF EXISTS "article_bookmarks_own"    ON article_bookmarks;

-- Patient-exclusive tables
CREATE POLICY "php_own" ON patient_health_profiles FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

CREATE POLICY "dhc_own" ON daily_health_checkins FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

CREATE POLICY "hg_own" ON health_goals FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- Reference / lookup tables (read-only for all authenticated users)
CREATE POLICY "facilities_read" ON facilities
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "clinicians_read" ON clinicians
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "clinicians_own" ON clinicians FOR ALL
  USING  (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "chw_profiles_read" ON chw_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "chw_profiles_own" ON chw_profiles FOR ALL
  USING  (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- CHW-patient assignment
CREATE POLICY "chw_assignments_select" ON chw_patient_assignments FOR SELECT
  USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR chw_id   IN (SELECT id FROM chw_profiles WHERE profile_id = auth.uid())
  );

CREATE POLICY "chw_assignments_manage" ON chw_patient_assignments FOR ALL
  USING  (chw_id IN (SELECT id FROM chw_profiles WHERE profile_id = auth.uid()))
  WITH CHECK (chw_id IN (SELECT id FROM chw_profiles WHERE profile_id = auth.uid()));

-- CHW visits
CREATE POLICY "chw_visits_select" ON chw_visits FOR SELECT
  USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR chw_id   IN (SELECT id FROM chw_profiles WHERE profile_id = auth.uid())
  );

CREATE POLICY "chw_visits_insert" ON chw_visits FOR INSERT
  WITH CHECK (chw_id IN (SELECT id FROM chw_profiles WHERE profile_id = auth.uid()));

-- Health monitors
CREATE POLICY "health_monitors_own" ON health_monitors FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- Vitals streaming
CREATE POLICY "vitals_streaming_select" ON vitals_streaming FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

CREATE POLICY "vitals_streaming_insert" ON vitals_streaming FOR INSERT
  WITH CHECK (TRUE);  -- wearable / service role

-- Teleconsult
CREATE POLICY "teleconsult_own" ON teleconsult_sessions FOR ALL
  USING (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR clinician_id = auth.uid()
    OR chw_id       = auth.uid()
  )
  WITH CHECK (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR clinician_id = auth.uid()
    OR chw_id       = auth.uid()
  );

-- Appointments
CREATE POLICY "appointments_own" ON appointments FOR ALL
  USING (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR clinician_id IN (SELECT id FROM clinicians WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR clinician_id IN (SELECT id FROM clinicians WHERE profile_id = auth.uid())
  );

-- Conditions
CREATE POLICY "conditions_own" ON conditions FOR ALL
  USING (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR diagnosed_by = auth.uid()
  )
  WITH CHECK (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR diagnosed_by = auth.uid()
  );

-- Medications
CREATE POLICY "medications_own" ON medications FOR ALL
  USING (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR prescribed_by = auth.uid()
  )
  WITH CHECK (
    patient_id    IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR prescribed_by = auth.uid()
  );

-- Lab results
CREATE POLICY "lab_results_own" ON lab_results FOR ALL
  USING (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR ordered_by = auth.uid()
  )
  WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR ordered_by = auth.uid()
  );

-- Vitals summary reports
CREATE POLICY "vsr_own" ON vitals_summary_reports FOR ALL
  USING (
    patient_id   IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR reviewed_by = auth.uid()
    OR teleconsult_id IN (
      SELECT id FROM teleconsult_sessions WHERE clinician_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id   IN (SELECT id FROM patients WHERE profile_id = auth.uid())
    OR reviewed_by = auth.uid()
  );

-- Health articles (published only)
CREATE POLICY "health_articles_published" ON health_articles FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = TRUE);

-- Article bookmarks
CREATE POLICY "article_bookmarks_own" ON article_bookmarks FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Patient-exclusive tables
GRANT SELECT, INSERT, UPDATE         ON patient_health_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON daily_health_checkins   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON health_goals            TO authenticated;

-- Reference tables
GRANT SELECT                         ON facilities              TO authenticated;
GRANT SELECT                         ON clinicians              TO authenticated;
GRANT SELECT                         ON chw_profiles            TO authenticated;

-- CHW operational
GRANT SELECT, INSERT, UPDATE, DELETE ON chw_patient_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON chw_visits              TO authenticated;

-- Health monitoring
GRANT SELECT, INSERT, UPDATE, DELETE ON health_monitors         TO authenticated;
GRANT SELECT, INSERT                 ON vitals_streaming        TO authenticated;

-- Telemedicine
GRANT SELECT, INSERT, UPDATE         ON teleconsult_sessions    TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON appointments            TO authenticated;

-- Clinical records
GRANT SELECT, INSERT, UPDATE         ON conditions              TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON medications             TO authenticated;
GRANT SELECT, INSERT                 ON lab_results             TO authenticated;

-- Reports
GRANT SELECT, INSERT, UPDATE         ON vitals_summary_reports  TO authenticated;

-- Blog
GRANT SELECT                         ON health_articles         TO authenticated;
GRANT SELECT, INSERT, DELETE         ON article_bookmarks       TO authenticated;

-- =============================================================================
-- DATA RETENTION (pg_cron)
-- =============================================================================
SELECT cron.schedule(
  'purge_patient_vitals_streaming',
  '0 2 1 * *',
  $$
    DELETE FROM vitals_streaming
    WHERE created_at < NOW() - INTERVAL '1 year'
      AND anomaly_detected = FALSE;
  $$
);

-- =============================================================================
-- DONE
-- patient_saathi_schema.sql — 15 tables, 12 enums, 57 indexes, 21 policies
--
-- Patient-exclusive tables (NEW):
--   patient_health_profiles · daily_health_checkins · health_goals
--
-- Shared Saathi tables (NO pregnancy_id columns):
--   facilities · clinicians · chw_profiles · chw_patient_assignments ·
--   chw_visits · health_monitors · vitals_streaming · teleconsult_sessions ·
--   appointments · conditions · medications · lab_results ·
--   vitals_summary_reports · health_articles · article_bookmarks
-- =============================================================================
