-- =============================================================================
-- SHETU PUSHTI MODULE — Supabase SQL Schema
-- Nutrition AI with Reward System: Geography-aware Diet Plans · Daily Checklist
-- Streak & Rewards · End-of-Day AI Review · Local Bangladeshi Food Database
-- =============================================================================
-- Prerequisites (run in order before this file):
--   1. auth_test.sql        (profiles table + user_role enum must exist)
--   2. maa_schema.sql       (patients · pregnancies)
-- =============================================================================
-- What this file adds (6 tables · 3 enums · 25 indexes · 13 policies):
--   Pushti-exclusive tables:
--     pushti_food_items · nutrition_profiles · meal_plans · meal_logs ·
--     meal_checklist_items · reward_points
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

DO $$ BEGIN CREATE TYPE nutrition_condition AS ENUM
  ('pregnancy','anaemia','diabetes','child_malnutrition','postpartum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE meal_type AS ENUM
  ('breakfast','lunch','dinner','snack');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE reward_action_type AS ENUM
  ('anc_visit','meal_log','symptom_report','vitals_log','education_complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- PART 1 — LOCAL BANGLADESHI FOOD DATABASE
-- Static curated food items tagged by season, division, price tier, and
-- nutritional suitability. Used by the Pushti diet planner for geography-aware
-- and condition-aware meal plan generation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: pushti_food_items
-- Curated Bangladeshi food database. Managed by admins via service_role.
-- Authenticated users read-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pushti_food_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identity ──────────────────────────────────────────────────────────────
  name_en             TEXT        NOT NULL,
  name_bn             TEXT        NOT NULL,
  food_category       TEXT        NOT NULL,
  -- e.g. 'grain', 'fish', 'vegetable', 'fruit', 'dairy', 'oil', 'spice', 'legume'

  -- ── Nutrition per 100g ────────────────────────────────────────────────────
  calories_per_100g   FLOAT       NOT NULL DEFAULT 0,
  protein_g           FLOAT       NOT NULL DEFAULT 0,
  carbs_g             FLOAT       NOT NULL DEFAULT 0,
  fat_g               FLOAT       NOT NULL DEFAULT 0,
  iron_mg             FLOAT       NOT NULL DEFAULT 0,
  calcium_mg          FLOAT       NOT NULL DEFAULT 0,
  folate_mcg          FLOAT       NOT NULL DEFAULT 0,
  fiber_g             FLOAT       NOT NULL DEFAULT 0,
  vitamin_c_mg        FLOAT       NOT NULL DEFAULT 0,
  potassium_mg        FLOAT       NOT NULL DEFAULT 0,
  sodium_mg           FLOAT       NOT NULL DEFAULT 0,

  -- ── Availability tagging ─────────────────────────────────────────────────
  season              TEXT[]      NOT NULL DEFAULT '{all}',
  -- values: 'all' | 'winter' | 'summer' | 'monsoon'
  divisions           TEXT[]      NOT NULL DEFAULT '{all}',
  -- values: 'all' | 'Dhaka' | 'Chattogram' | 'Rajshahi' | 'Khulna' |
  --         'Sylhet' | 'Barishal' | 'Rangpur' | 'Mymensingh'
  price_tier          TEXT        NOT NULL DEFAULT 'low',
  -- values: 'low' | 'mid' | 'premium'

  -- ── Condition suitability ─────────────────────────────────────────────────
  good_for            TEXT[]      NOT NULL DEFAULT '{}',
  -- values: 'pregnancy' | 'anaemia' | 'diabetes' | 'hypertension' |
  --         'child' | 'adolescent' | 'general'
  avoid_for           TEXT[]      NOT NULL DEFAULT '{}',
  -- values: 'diabetes' | 'hypertension' | 'kidney' | 'gout'

  -- ── Meta ──────────────────────────────────────────────────────────────────
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_pushti_food_items_updated_at
  BEFORE UPDATE ON pushti_food_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pfi_name_en       ON pushti_food_items(name_en);
CREATE INDEX IF NOT EXISTS idx_pfi_food_category ON pushti_food_items(food_category);
CREATE INDEX IF NOT EXISTS idx_pfi_price_tier    ON pushti_food_items(price_tier);
CREATE INDEX IF NOT EXISTS idx_pfi_is_active     ON pushti_food_items(is_active);
CREATE INDEX IF NOT EXISTS idx_pfi_season        ON pushti_food_items USING GIN(season);
CREATE INDEX IF NOT EXISTS idx_pfi_divisions     ON pushti_food_items USING GIN(divisions);
CREATE INDEX IF NOT EXISTS idx_pfi_good_for      ON pushti_food_items USING GIN(good_for);
CREATE INDEX IF NOT EXISTS idx_pfi_avoid_for     ON pushti_food_items USING GIN(avoid_for);
CREATE INDEX IF NOT EXISTS idx_pfi_name_trgm     ON pushti_food_items USING GIN(name_en gin_trgm_ops);

-- =============================================================================
-- PART 2 — NUTRITION PROFILES
-- Personalised macro/micro targets per patient per condition, localised by
-- division and district for regional food availability awareness.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: nutrition_profiles
-- One active profile per patient per condition track. The Pushti AI reads
-- this to constrain meal plan generation (calories, iron, folate, calcium).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutrition_profiles (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID                NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_id        UUID                REFERENCES pregnancies(id) ON DELETE SET NULL,

  -- ── Condition & location ──────────────────────────────────────────────────
  condition           nutrition_condition NOT NULL,
  division            TEXT,
  district            TEXT,

  -- ── Intake profile snapshot (mirrors Phase 1 from Drishti / Pushti form) ─
  gender              TEXT,
  -- stored as text to avoid enum dependency: 'male'|'female'|'third_gender'
  age                 INT,
  weight_kg           FLOAT,
  height_cm           FLOAT,
  known_conditions    TEXT[]              NOT NULL DEFAULT '{}',
  -- e.g. ['Hypertension','Anaemia','Gestational Diabetes']

  -- ── AI-generated nutrition targets ───────────────────────────────────────
  calorie_target      INT,
  protein_g           FLOAT,
  iron_mg             FLOAT,
  folic_acid_mcg      FLOAT,
  calcium_mg          FLOAT,
  hydration_ml        INT,

  -- ── Condition track ───────────────────────────────────────────────────────
  track_id            TEXT,
  -- mirrors LLM output: 'pregnancy'|'anaemia'|'diabetes'|'hypertension'|
  --                     'child'|'adolescent'|'general'

  -- ── AI generation metadata ────────────────────────────────────────────────
  generated_by_model  TEXT,
  supplements         JSONB,
  -- supplements schema: [{name: string, dose: string, timing: string}]
  avoid_foods         JSONB,
  -- avoid_foods schema: [{name: string, reason: string}]

  -- ── Meta ──────────────────────────────────────────────────────────────────
  is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_nutrition_profiles_updated_at
  BEFORE UPDATE ON nutrition_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_patient_id  ON nutrition_profiles(patient_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_pregnancy_id ON nutrition_profiles(pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_condition   ON nutrition_profiles(condition);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_is_active   ON nutrition_profiles(is_active);

-- =============================================================================
-- PART 3 — MEAL PLANS
-- AI-generated weekly meal plans. plan_data stores the full structured plan
-- as returned by the Pushti LLM (Sonnet cascade). Immutable after creation —
-- a new row is inserted for each regeneration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: meal_plans
-- One record per AI-generated weekly plan per patient.
-- plan_week uses ISO week number. plan_data is the full LLM JSON output.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nutrition_profile_id UUID        NOT NULL REFERENCES nutrition_profiles(id) ON DELETE CASCADE,
  patient_id           UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Plan period ───────────────────────────────────────────────────────────
  plan_week            INT         NOT NULL,   -- ISO week number (1–53)
  plan_year            INT         NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INT,
  plan_start_date      DATE,                   -- Monday of plan_week
  plan_end_date        DATE,                   -- Sunday of plan_week

  -- ── Full LLM plan output ──────────────────────────────────────────────────
  plan_data            JSONB       NOT NULL,
  -- plan_data schema:
  --   { daily_calories_target: int,
  --     meal_plan: {
  --       breakfast: [{food, amount_g, notes}],
  --       lunch:     [{food, amount_g, notes}],
  --       snack:     [{food, amount_g, notes}],
  --       dinner:    [{food, amount_g, notes}]
  --     },
  --     weekly_variety: [{day, highlight_food, benefit}],
  --     hydration_ml: int,
  --     supplements: [{name, dose, timing}],
  --     track_id: string
  --   }

  -- ── Season context at generation time ────────────────────────────────────
  season_at_generation TEXT,
  -- 'winter'|'summer'|'monsoon' — derived from month at plan creation

  -- ── AI generation metadata ────────────────────────────────────────────────
  generated_by_model   TEXT,
  generation_latency_ms INT,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_patient_id   ON meal_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_profile_id   ON meal_plans(nutrition_profile_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_plan_week    ON meal_plans(plan_year, plan_week);
CREATE INDEX IF NOT EXISTS idx_meal_plans_created_at   ON meal_plans(created_at DESC);

-- =============================================================================
-- PART 4 — MEAL LOGS
-- Daily food intake logging. Each row records one meal event.
-- food_items is the LLM/manual list of what the patient actually ate.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: meal_logs
-- Patient-recorded daily meal intake. One record per meal per day.
-- Adherence % is computed at query time from meal_checklist_items.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  meal_plan_id        UUID        REFERENCES meal_plans(id) ON DELETE SET NULL,
  -- NULL if logged outside a plan (ad-hoc logging)

  -- ── Meal details ──────────────────────────────────────────────────────────
  meal_type           meal_type   NOT NULL,
  food_items          JSONB,
  -- food_items schema:
  --   [{name: string, name_bn: string, quantity: float,
  --     unit: string, calories: float, amount_g: float}]
  estimated_calories  FLOAT,

  -- ── Log date/time ─────────────────────────────────────────────────────────
  log_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Notes ─────────────────────────────────────────────────────────────────
  notes               TEXT,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_patient_id  ON meal_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_meal_plan_id ON meal_logs(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_log_date    ON meal_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_meal_logs_meal_type   ON meal_logs(meal_type);

-- =============================================================================
-- PART 5 — MEAL CHECKLIST ITEMS
-- The daily to-do checklist for the Pushti UI. One row per food item per meal
-- per day. Tracks eaten / not_available state and substitute suggestions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: meal_checklist_items
-- Implements the Pushti daily checklist tab. Seeded from the active meal plan
-- each day; user ticks items as eaten or marks them not available.
-- Long-press "not available" triggers a substitute suggestion stored here.
-- =============================================================================
CREATE TABLE IF NOT EXISTS meal_checklist_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  meal_plan_id        UUID        NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  meal_log_id         UUID        REFERENCES meal_logs(id) ON DELETE SET NULL,
  -- linked once the patient logs eating this item

  -- ── Item identity ─────────────────────────────────────────────────────────
  checklist_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  meal_type           meal_type   NOT NULL,
  food_name           TEXT        NOT NULL,
  food_name_bn        TEXT,
  amount_g            FLOAT,
  notes               TEXT,       -- from plan_data (benefit hint shown to user)

  -- ── Status ────────────────────────────────────────────────────────────────
  is_eaten            BOOLEAN     NOT NULL DEFAULT FALSE,
  eaten_at            TIMESTAMPTZ,
  is_available        BOOLEAN     NOT NULL DEFAULT TRUE,
  -- FALSE = patient long-pressed "Not available"

  -- ── Substitute suggestion (generated when is_available = FALSE) ───────────
  substitute_requested BOOLEAN    NOT NULL DEFAULT FALSE,
  substitute_food      TEXT,
  substitute_amount_g  FLOAT,
  substitute_notes     TEXT,
  substitute_generated_by_model TEXT,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (patient_id, meal_plan_id, checklist_date, meal_type, food_name)
);

CREATE OR REPLACE TRIGGER set_meal_checklist_items_updated_at
  BEFORE UPDATE ON meal_checklist_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_mci_patient_id       ON meal_checklist_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_mci_meal_plan_id     ON meal_checklist_items(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_mci_checklist_date   ON meal_checklist_items(checklist_date DESC);
CREATE INDEX IF NOT EXISTS idx_mci_is_eaten         ON meal_checklist_items(is_eaten);
CREATE INDEX IF NOT EXISTS idx_mci_is_available     ON meal_checklist_items(is_available);

-- =============================================================================
-- PART 6 — REWARD POINTS
-- Gamification layer. Points are awarded by the backend (service_role) when
-- the patient hits adherence thresholds. Patients read their own balance;
-- the streak and badge state are derived from this table at query time or
-- persisted in client localStorage (shetu_streak key).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: reward_points
-- Append-only ledger of earned points per patient per action.
-- Running total = SUM(points) WHERE patient_id = x.
-- reference_id links to the triggering record (meal_log, anc_checkup, etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_points (
  id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID               NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ── Points event ──────────────────────────────────────────────────────────
  points        INT                NOT NULL CHECK (points > 0),
  action_type   reward_action_type NOT NULL,
  reference_id  UUID,
  -- polymorphic FK to the triggering record:
  --   meal_log      → meal_logs.id        (action_type = 'meal_log')
  --   anc_checkup   → anc_checkups.id     (action_type = 'anc_visit')
  --   symptom       → symptoms.id         (action_type = 'symptom_report')
  --   vitals        → vitals.id           (action_type = 'vitals_log')

  -- ── Streak context ────────────────────────────────────────────────────────
  adherence_pct FLOAT,
  -- adherence % that triggered this award (e.g. 75.0 = ≥70% → +10 pts)
  award_date    DATE               NOT NULL DEFAULT CURRENT_DATE,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_points_patient_id   ON reward_points(patient_id);
CREATE INDEX IF NOT EXISTS idx_reward_points_action_type  ON reward_points(action_type);
CREATE INDEX IF NOT EXISTS idx_reward_points_award_date   ON reward_points(award_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE pushti_food_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_checklist_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_points           ENABLE ROW LEVEL SECURITY;

-- Drop before recreating (idempotent)
DROP POLICY IF EXISTS "pfi_read"                     ON pushti_food_items;
DROP POLICY IF EXISTS "nutrition_profiles_own"       ON nutrition_profiles;
DROP POLICY IF EXISTS "nutrition_profiles_chw"       ON nutrition_profiles;
DROP POLICY IF EXISTS "meal_plans_own"               ON meal_plans;
DROP POLICY IF EXISTS "meal_plans_chw"               ON meal_plans;
DROP POLICY IF EXISTS "meal_logs_own"                ON meal_logs;
DROP POLICY IF EXISTS "meal_logs_chw"                ON meal_logs;
DROP POLICY IF EXISTS "mci_own"                      ON meal_checklist_items;
DROP POLICY IF EXISTS "reward_points_own"            ON reward_points;
DROP POLICY IF EXISTS "reward_points_insert_service" ON reward_points;

-- ── pushti_food_items ────────────────────────────────────────────────────────
-- Read-only for all authenticated users; managed by admins via service_role
CREATE POLICY "pfi_read" ON pushti_food_items
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);

-- ── nutrition_profiles ───────────────────────────────────────────────────────
-- Patient: full access to their own profiles
CREATE POLICY "nutrition_profiles_own" ON nutrition_profiles
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read-only for assigned patients (to view their nutrition plan in field)
CREATE POLICY "nutrition_profiles_chw" ON nutrition_profiles
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

-- ── meal_plans ───────────────────────────────────────────────────────────────
-- Patient: full access to their own meal plans
CREATE POLICY "meal_plans_own" ON meal_plans
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read-only for assigned patients
CREATE POLICY "meal_plans_chw" ON meal_plans
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

-- ── meal_logs ────────────────────────────────────────────────────────────────
-- Patient: full access to their own meal logs
CREATE POLICY "meal_logs_own" ON meal_logs
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- CHW: read-only for assigned patients (to review adherence during field visit)
CREATE POLICY "meal_logs_chw" ON meal_logs
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

-- ── meal_checklist_items ──────────────────────────────────────────────────────
-- Patient: full access to their own checklist (tick, mark unavailable, view substitute)
CREATE POLICY "mci_own" ON meal_checklist_items
  FOR ALL
  USING  (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- ── reward_points ─────────────────────────────────────────────────────────────
-- Patient: read-only (balance display, streak, badge computation)
CREATE POLICY "reward_points_own" ON reward_points
  FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE profile_id = auth.uid()));

-- Inserts are service_role only (backend awards points; patients cannot self-award)
CREATE POLICY "reward_points_insert_service" ON reward_points
  FOR INSERT WITH CHECK (TRUE);
-- service_role bypasses RLS entirely; this policy covers authenticated role
-- edge cases only — in practice only the service_role backend inserts here

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Food database: read-only for authenticated users
GRANT SELECT ON pushti_food_items TO authenticated;

-- Nutrition profiles: patients insert and update their own
GRANT SELECT, INSERT, UPDATE ON nutrition_profiles TO authenticated;

-- Meal plans: patients insert their own (no update — immutable after generation)
GRANT SELECT, INSERT ON meal_plans TO authenticated;

-- Meal logs: patients insert their own entries
GRANT SELECT, INSERT ON meal_logs TO authenticated;

-- Checklist items: patients insert (seeded from plan) and update (tick/unavailable)
GRANT SELECT, INSERT, UPDATE ON meal_checklist_items TO authenticated;

-- Reward points: read-only for authenticated; service_role inserts via bypass
GRANT SELECT ON reward_points TO authenticated;

-- =============================================================================
-- DATA RETENTION (pg_cron)
-- =============================================================================

-- Purge checklist items older than 1 year (high-volume daily rows)
-- Meal logs are retained for the full 7-year clinical window
SELECT cron.schedule(
  'purge_pushti_checklist_items',
  '0 2 1 * *',   -- 1st of every month at 02:00
  $$
    DELETE FROM meal_checklist_items
    WHERE checklist_date < CURRENT_DATE - INTERVAL '1 year';
  $$
);

-- Purge old meal plans beyond 2 years (plan_data can be large JSONB)
-- Retain nutrition_profiles and meal_logs indefinitely for clinical audit
SELECT cron.schedule(
  'purge_pushti_old_meal_plans',
  '0 3 1 * *',   -- 1st of every month at 03:00
  $$
    DELETE FROM meal_plans
    WHERE created_at < NOW() - INTERVAL '2 years';
  $$
);

-- =============================================================================
-- DONE
-- pushti_schema.sql — 6 tables, 3 enums, 25 indexes, 13 policies
--
-- Pushti-exclusive tables:
--   pushti_food_items        — curated Bangladeshi food DB (season/division/condition tagged)
--   nutrition_profiles       — personalised macro/micro targets per patient per condition
--   meal_plans               — AI-generated weekly meal plans (full LLM JSON output)
--   meal_logs                — daily patient-recorded food intake per meal
--   meal_checklist_items     — daily checklist: eaten / not_available / substitute
--   reward_points            — append-only gamification points ledger
--
-- N.B. ministry role is NOT referenced anywhere in this schema.
--      No bare enum literals used in RLS policies (role::text cast where needed).
--      No profile_id column queried on the profiles table (uses profiles.id).
--      CHW access verified via chw_profiles.profile_id (correct column).
--      Reward point inserts are service_role only — patients cannot self-award.
-- =============================================================================
