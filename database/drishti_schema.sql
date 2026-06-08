-- =============================================================================
-- SHETU DRISHTI MODULE — Supabase SQL Schema
-- Risk Prediction Q&A Engine: Branching Q&A · XGBoost Risk Scoring ·
-- SHAP Explainability · Specialist Routing · CHW Alert · Report Card
-- =============================================================================
-- Prerequisites (run in order before this file):
--   1. auth_test.sql        (profiles table + user_role enum must exist)
--   2. maa_schema.sql       (patients · pregnancies · vitals · symptoms)
-- =============================================================================
-- What this file adds (5 tables · 4 enums · 22 indexes · 12 policies):
--   Drishti-exclusive tables:
--     risk_questions · risk_assessments · risk_report_cards ·
--     drishti_specialist_reviews · drishti_chw_alerts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

DO $$ BEGIN CREATE TYPE risk_band AS ENUM ('low','watch','elevated','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE gender_type AS ENUM ('male','female','third_gender','prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE hitl_decision AS ENUM ('approved','overridden','escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE specialist_review_status AS ENUM
  ('pending','in_review','confirmed','adjusted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- PART 1 — DRISHTI CORE: QUESTION BANK
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: risk_questions
-- Bilingual adaptive questionnaire bank for the branching Q&A engine.
-- Each question maps its answers to the next question via branching_map.
-- cohort_tags drives which questions surface per patient profile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_questions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Question identity ─────────────────────────────────────────────────────
  question_key     TEXT        NOT NULL UNIQUE,   -- e.g. 'q_fatigue', 'q_vision'
  question_text_en TEXT        NOT NULL,
  question_text_bn TEXT        NOT NULL,

  -- ── Ordering & branching ──────────────────────────────────────────────────
  question_order   INT         NOT NULL DEFAULT 0, -- display order in linear fallback
  options          JSONB       NOT NULL,
  -- options schema: [{value: string, label_en: string, label_bn: string,
  --                   next_question_key: string|null}]
  -- next_question_key = null signals end of branch
  branching_map    JSONB,
  -- branching_map schema: {answer_value: next_question_key|null, ...}
  -- overrides options[].next_question_key for complex multi-condition routing

  -- ── Targeting ─────────────────────────────────────────────────────────────
  cohort_tags      TEXT[]      NOT NULL DEFAULT '{}',
  -- e.g. ['pregnancy','anaemia','diabetes','hypertension','general']
  is_mandatory     BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_risk_questions_updated_at
  BEFORE UPDATE ON risk_questions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_risk_questions_is_active   ON risk_questions(is_active);
CREATE INDEX IF NOT EXISTS idx_risk_questions_order       ON risk_questions(question_order);
CREATE INDEX IF NOT EXISTS idx_risk_questions_cohort      ON risk_questions USING GIN(cohort_tags);

-- =============================================================================
-- PART 2 — RISK ASSESSMENTS
-- Core Drishti output: stores the full Q&A session, model inputs/outputs,
-- SHAP explainability, ranked candidate conditions, and final risk band.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: risk_assessments
-- One record per completed Drishti Q&A session per patient.
-- Captures patient intake profile, structured answers, XGBoost feature
-- vector, SHAP attributions, top conditions, risk band, and recommended action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id        UUID        REFERENCES pregnancies(id) ON DELETE SET NULL,

  -- ── Session tracking ──────────────────────────────────────────────────────
  session_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  -- session_id groups multi-phase interactions for the same assessment run

  -- ── Phase 1: Patient intake profile ──────────────────────────────────────
  intake_profile      JSONB       NOT NULL DEFAULT '{}',
  -- intake_profile schema:
  --   { gender: string, is_pregnant: boolean|null, age: int,
  --     weight_kg: float, height_cm: float, bmi: float,
  --     division: string, known_conditions: string[],
  --     lab_report_uploaded: boolean }

  -- ── Phase 2: Structured Q&A answers ──────────────────────────────────────
  questions_answered  JSONB       NOT NULL DEFAULT '[]',
  -- questions_answered schema:
  --   [{question_key: string, question_text_en: string,
  --     answer_value: string, answer_label: string, turn_number: int}]
  total_turns         INT         NOT NULL DEFAULT 0,

  -- ── Phase 3: Model inputs & outputs ──────────────────────────────────────
  xgboost_features    JSONB,
  -- xgboost_features: flat key-value map of encoded features fed to the model
  raw_llm_response    JSONB,
  -- raw_llm_response: unparsed JSON string from the LLM cascade, stored for audit
  model_used          TEXT,       -- e.g. 'openai/gpt-4o-mini', 'gemini-2.0-flash'
  model_version       TEXT,

  -- ── Risk output ───────────────────────────────────────────────────────────
  risk_score          FLOAT       CHECK (risk_score BETWEEN 0 AND 100),
  risk_band           risk_band,
  overall_band        risk_band,  -- top-level band returned by LLM (matches risk_band)
  top_conditions      JSONB,
  -- top_conditions schema (max 5, probability DESC):
  --   [{name: string, probability: float, band: risk_band,
  --     contributing_symptoms: string[], confidence: 'low'|'medium'|'high'}]

  -- ── Explainability (SHAP) ─────────────────────────────────────────────────
  shap_attributions   JSONB,
  -- shap_attributions schema: [{feature: string, shap_value: float}]

  -- ── Recommended action ────────────────────────────────────────────────────
  recommended_action  TEXT,       -- e.g. "Visit a clinician within 48 hours"
  action_timeframe    TEXT,       -- e.g. "Within 48 hours"

  -- ── Escalation flags ──────────────────────────────────────────────────────
  alert_chw           BOOLEAN     NOT NULL DEFAULT FALSE,
  -- TRUE if overall_band = 'urgent': CHW/family alert should be sent
  specialist_needed   BOOLEAN     NOT NULL DEFAULT FALSE,
  -- TRUE if ambiguous/high-risk case requires specialist review

  -- ── Lab report (optional upload) ─────────────────────────────────────────
  lab_report_storage_url TEXT,    -- S3-compatible URL for uploaded PDF/image
  lab_values_extracted   JSONB,
  -- lab_values_extracted: {glucose, hba1c, systolic_bp, diastolic_bp,
  --   haemoglobin, creatinine, ...} parsed from uploaded report

  -- ── Assessment metadata ───────────────────────────────────────────────────
  assessed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_risk_assessments_updated_at
  BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_risk_assessments_patient_id   ON risk_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_pregnancy_id ON risk_assessments(pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_session_id   ON risk_assessments(session_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk_band    ON risk_assessments(risk_band);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_alert_chw    ON risk_assessments(alert_chw);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_assessed_at  ON risk_assessments(assessed_at DESC);

-- =============================================================================
-- PART 3 — RISK REPORT CARDS
-- The rendered, patient-facing output of a Drishti assessment.
-- Decoupled from risk_assessments to allow clinician annotation without
-- mutating the immutable assessment record.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: risk_report_cards
-- One-to-one with risk_assessments. Stores the final report card state
-- as presented to the patient, plus download metadata and clinician sign-off.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_report_cards (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       UUID        NOT NULL UNIQUE REFERENCES risk_assessments(id) ON DELETE CASCADE,
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Report content ────────────────────────────────────────────────────────
  overall_band        risk_band   NOT NULL,
  conditions_summary  JSONB       NOT NULL DEFAULT '[]',
  -- mirrors top_conditions from risk_assessments, frozen at report-generation time
  next_action         TEXT        NOT NULL,
  action_timeframe    TEXT        NOT NULL,

  -- ── Alert strips (UI flags) ───────────────────────────────────────────────
  chw_alert_shown     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- TRUE = "Alert sent to your care worker" strip displayed
  specialist_strip_shown BOOLEAN  NOT NULL DEFAULT FALSE,
  -- TRUE = "Shetu specialist review recommended" strip displayed

  -- ── Download audit ────────────────────────────────────────────────────────
  download_count      INT         NOT NULL DEFAULT 0,
  last_downloaded_at  TIMESTAMPTZ,

  -- ── Clinician sign-off ────────────────────────────────────────────────────
  clinician_reviewed  BOOLEAN     NOT NULL DEFAULT FALSE,
  reviewed_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  clinician_notes     TEXT,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_risk_report_cards_updated_at
  BEFORE UPDATE ON risk_report_cards
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_risk_report_cards_assessment_id ON risk_report_cards(assessment_id);
CREATE INDEX IF NOT EXISTS idx_risk_report_cards_patient_id    ON risk_report_cards(patient_id);
CREATE INDEX IF NOT EXISTS idx_risk_report_cards_overall_band  ON risk_report_cards(overall_band);
CREATE INDEX IF NOT EXISTS idx_risk_report_cards_generated_at  ON risk_report_cards(generated_at DESC);

-- =============================================================================
-- PART 4 — SPECIALIST REVIEWS
-- When specialist_needed = TRUE on an assessment, the case summary is
-- auto-routed to an NRB/Shetu specialist for confirmation or adjustment.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: drishti_specialist_reviews
-- Tracks the specialist review workflow for ambiguous or high-risk cases.
-- A specialist (NRB or local clinician) reviews the assessment and either
-- confirms or adjusts the Drishti output before it is actioned.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drishti_specialist_reviews (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       UUID                    NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  patient_id          UUID                    NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Reviewer ──────────────────────────────────────────────────────────────
  specialist_id       UUID                    REFERENCES profiles(id) ON DELETE SET NULL,
  -- NULL until a specialist claims the case
  is_nrb_specialist   BOOLEAN                 NOT NULL DEFAULT FALSE,
  -- TRUE if routing went to NRB (Non-Resident Bangladeshi) network

  -- ── Review state ──────────────────────────────────────────────────────────
  status              specialist_review_status NOT NULL DEFAULT 'pending',
  assigned_at         TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,

  -- ── Case summary sent to specialist ──────────────────────────────────────
  case_summary        TEXT,
  -- Auto-generated plain-text summary of intake profile + answers + AI output

  -- ── Specialist decision ───────────────────────────────────────────────────
  decision            hitl_decision,
  -- 'approved': confirms Drishti output; 'overridden': replaces output;
  -- 'escalated': routes to higher-level clinician
  adjusted_risk_band  risk_band,
  -- populated only when decision = 'overridden'
  adjusted_conditions JSONB,
  -- adjusted top conditions when decision = 'overridden'
  specialist_notes    TEXT,
  recommended_action  TEXT,
  -- specialist's recommended action (overrides assessment.recommended_action when set)

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_drishti_specialist_reviews_updated_at
  BEFORE UPDATE ON drishti_specialist_reviews
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dsr_assessment_id  ON drishti_specialist_reviews(assessment_id);
CREATE INDEX IF NOT EXISTS idx_dsr_patient_id     ON drishti_specialist_reviews(patient_id);
CREATE INDEX IF NOT EXISTS idx_dsr_specialist_id  ON drishti_specialist_reviews(specialist_id);
CREATE INDEX IF NOT EXISTS idx_dsr_status         ON drishti_specialist_reviews(status);
CREATE INDEX IF NOT EXISTS idx_dsr_created_at     ON drishti_specialist_reviews(created_at DESC);

-- =============================================================================
-- PART 5 — CHW / FAMILY ALERTS
-- When alert_chw = TRUE on an assessment (overall_band = 'urgent'),
-- an alert record is created and the notification state tracked here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: drishti_chw_alerts
-- Tracks urgent-band alert dispatch to CHW and family contacts.
-- One alert record per urgent risk_assessment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drishti_chw_alerts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       UUID        NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Notification dispatch ─────────────────────────────────────────────────
  chw_notified        BOOLEAN     NOT NULL DEFAULT FALSE,
  chw_notified_at     TIMESTAMPTZ,
  chw_id              UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- resolved CHW from chw_patient_assignments at alert time

  family_notified     BOOLEAN     NOT NULL DEFAULT FALSE,
  family_notified_at  TIMESTAMPTZ,
  -- family contact resolved from patients.emergency_contact_phone

  -- ── Alert content ─────────────────────────────────────────────────────────
  alert_message       TEXT,
  -- Short SMS/push alert text sent to CHW and family
  alert_risk_band     risk_band   NOT NULL DEFAULT 'urgent',
  top_condition_name  TEXT,
  -- Highest-probability condition name from assessment, included in alert

  -- ── Resolution ────────────────────────────────────────────────────────────
  acknowledged_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  acknowledged_at     TIMESTAMPTZ,
  resolution_notes    TEXT,
  is_resolved         BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at         TIMESTAMPTZ,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_drishti_chw_alerts_updated_at
  BEFORE UPDATE ON drishti_chw_alerts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dca_assessment_id ON drishti_chw_alerts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_dca_patient_id    ON drishti_chw_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_dca_chw_id        ON drishti_chw_alerts(chw_id);
CREATE INDEX IF NOT EXISTS idx_dca_is_resolved   ON drishti_chw_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_dca_created_at    ON drishti_chw_alerts(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE risk_questions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_report_cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE drishti_specialist_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drishti_chw_alerts          ENABLE ROW LEVEL SECURITY;

-- Drop before recreating (idempotent)
DROP POLICY IF EXISTS "risk_questions_read"          ON risk_questions;
DROP POLICY IF EXISTS "risk_assessments_own"         ON risk_assessments;
DROP POLICY IF EXISTS "risk_assessments_chw"         ON risk_assessments;
DROP POLICY IF EXISTS "risk_assessments_clinician"   ON risk_assessments;
DROP POLICY IF EXISTS "risk_report_cards_own"        ON risk_report_cards;
DROP POLICY IF EXISTS "risk_report_cards_chw"        ON risk_report_cards;
DROP POLICY IF EXISTS "risk_report_cards_clinician"  ON risk_report_cards;
DROP POLICY IF EXISTS "dsr_patient_read"             ON drishti_specialist_reviews;
DROP POLICY IF EXISTS "dsr_specialist_own"           ON drishti_specialist_reviews;
DROP POLICY IF EXISTS "dca_patient_read"             ON drishti_chw_alerts;
DROP POLICY IF EXISTS "dca_chw_own"                  ON drishti_chw_alerts;
DROP POLICY IF EXISTS "dca_admin_all"                ON drishti_chw_alerts;

-- ── risk_questions ───────────────────────────────────────────────────────────
-- All authenticated users may read active questions (needed to render the Q&A)
CREATE POLICY "risk_questions_read" ON risk_questions
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);

-- ── risk_assessments ─────────────────────────────────────────────────────────
-- Patient: full access to their own assessments
CREATE POLICY "risk_assessments_own" ON risk_assessments
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read-only for assigned patients (needed for triage dashboard)
CREATE POLICY "risk_assessments_chw" ON risk_assessments
  FOR SELECT
  USING (
    patient_id IN (
      SELECT cpa.patient_id
      FROM chw_patient_assignments cpa
      JOIN chw_profiles cp ON cp.id = cpa.chw_id
      WHERE cp.profile_id = auth.uid()
        AND cpa.is_active = TRUE
    )
  );

-- Clinician: read-only for patients with an appointment or teleconsult
CREATE POLICY "risk_assessments_clinician" ON risk_assessments
  FOR SELECT
  USING (
    patient_id IN (
      SELECT a.patient_id FROM appointments a
      JOIN clinicians c ON c.id = a.clinician_id
      WHERE c.profile_id = auth.uid()
      UNION
      SELECT ts.patient_id FROM teleconsult_sessions ts
      WHERE ts.clinician_id = auth.uid()
    )
  );

-- ── risk_report_cards ────────────────────────────────────────────────────────
-- Patient: full access to their own report cards
CREATE POLICY "risk_report_cards_own" ON risk_report_cards
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read-only for assigned patients (for field triage support)
CREATE POLICY "risk_report_cards_chw" ON risk_report_cards
  FOR SELECT
  USING (
    patient_id IN (
      SELECT cpa.patient_id
      FROM chw_patient_assignments cpa
      JOIN chw_profiles cp ON cp.id = cpa.chw_id
      WHERE cp.profile_id = auth.uid()
        AND cpa.is_active = TRUE
    )
  );

-- Clinician: read + update (for clinician_notes / sign-off) on their patients
CREATE POLICY "risk_report_cards_clinician" ON risk_report_cards
  FOR ALL
  USING (
    reviewed_by = auth.uid()
    OR patient_id IN (
      SELECT a.patient_id FROM appointments a
      JOIN clinicians c ON c.id = a.clinician_id
      WHERE c.profile_id = auth.uid()
      UNION
      SELECT ts.patient_id FROM teleconsult_sessions ts
      WHERE ts.clinician_id = auth.uid()
    )
  )
  WITH CHECK (
    reviewed_by = auth.uid()
  );

-- ── drishti_specialist_reviews ────────────────────────────────────────────────
-- Patient: read-only (can see that their case is under specialist review)
CREATE POLICY "dsr_patient_read" ON drishti_specialist_reviews
  FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- Specialist (clinician role): full access to reviews assigned to them,
-- and read access to pending/unassigned reviews so they can claim cases.
-- Clinician identity is confirmed via the clinicians table (avoids relying
-- on the user_role enum value which may differ across environments).
CREATE POLICY "dsr_specialist_own" ON drishti_specialist_reviews
  FOR ALL
  USING (
    specialist_id = auth.uid()
    OR (specialist_id IS NULL AND status = 'pending'
        AND auth.uid() IN (SELECT profile_id FROM clinicians))
  )
  WITH CHECK (
    specialist_id = auth.uid()
  );

-- ── drishti_chw_alerts ────────────────────────────────────────────────────────
-- Patient: read-only (can see alerts generated from their assessments)
CREATE POLICY "dca_patient_read" ON drishti_chw_alerts
  FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read + update (acknowledge/resolve alerts for their assigned patients)
CREATE POLICY "dca_chw_own" ON drishti_chw_alerts
  FOR ALL
  USING (
    chw_id = auth.uid()
    OR patient_id IN (
      SELECT cpa.patient_id
      FROM chw_patient_assignments cpa
      JOIN chw_profiles cp ON cp.id = cpa.chw_id
      WHERE cp.profile_id = auth.uid()
        AND cpa.is_active = TRUE
    )
  )
  WITH CHECK (
    chw_id = auth.uid()
    OR patient_id IN (
      SELECT cpa.patient_id
      FROM chw_patient_assignments cpa
      JOIN chw_profiles cp ON cp.id = cpa.chw_id
      WHERE cp.profile_id = auth.uid()
        AND cpa.is_active = TRUE
    )
  );

-- Admin: full access (no ministry role — removed per project requirements)
-- role cast to text avoids a hard dependency on the user_role enum label.
CREATE POLICY "dca_admin_all" ON drishti_chw_alerts
  FOR ALL
  USING  (auth.uid() IN (SELECT id FROM profiles WHERE role::text = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role::text = 'admin'));

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- risk_questions: read-only for authenticated users (question bank is managed
-- by admins via service_role or direct DB access)
GRANT SELECT ON risk_questions TO authenticated;

-- risk_assessments: patients insert their own; CHWs and clinicians read via RLS
GRANT SELECT, INSERT, UPDATE ON risk_assessments TO authenticated;

-- risk_report_cards: patients and clinicians read; clinicians update for sign-off
GRANT SELECT, INSERT, UPDATE ON risk_report_cards TO authenticated;

-- drishti_specialist_reviews: specialists read + update; service_role inserts
-- (the backend creates the review record automatically on specialist_needed = TRUE)
GRANT SELECT, UPDATE ON drishti_specialist_reviews TO authenticated;

-- drishti_chw_alerts: CHWs read + update; service_role inserts
-- (the backend creates the alert record automatically on alert_chw = TRUE)
GRANT SELECT, UPDATE ON drishti_chw_alerts TO authenticated;

-- =============================================================================
-- DATA RETENTION (pg_cron)
-- =============================================================================
-- Raw LLM responses in risk_assessments can be large; strip them after 1 year
-- while retaining the structured risk output for the 7-year clinical retention window.
SELECT cron.schedule(
  'purge_drishti_raw_llm_responses',
  '0 3 1 * *',   -- 1st of every month at 03:00
  $$
    UPDATE risk_assessments
    SET raw_llm_response = NULL
    WHERE raw_llm_response IS NOT NULL
      AND assessed_at < NOW() - INTERVAL '1 year';
  $$
);

-- =============================================================================
-- DONE
-- drishti_schema.sql — 5 tables, 4 enums, 22 indexes, 12 policies
--
-- Drishti-exclusive tables:
--   risk_questions          — bilingual branching Q&A question bank
--   risk_assessments        — full session: intake + answers + model output + SHAP
--   risk_report_cards       — patient-facing report card, clinician sign-off
--   drishti_specialist_reviews — NRB/specialist HITL review workflow
--   drishti_chw_alerts      — urgent-band CHW & family alert dispatch tracking
--
-- N.B. ministry role is NOT referenced anywhere in this schema.
--      admin role is the highest privilege level.
--      Tables from maa_schema.sql (patients, pregnancies, profiles,
--      chw_patient_assignments, chw_profiles, teleconsult_sessions,
--      appointments, clinicians) are referenced via FK but not redefined here.
-- =============================================================================
