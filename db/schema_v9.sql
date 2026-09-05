-- ============================================================
-- DIC ALUMNI PLATFORM — SCHEMA v9
--
-- Two additions, both purely additive and idempotent. Nothing is dropped,
-- no column changes type, and no NOT NULL is added to an existing table.
--
--   REQ-03  Real directory search. /api/alumni ran LOWER(col) LIKE '%term%'
--           across seven columns, which no index can serve — every keystroke
--           was a sequential scan of alumni_profiles joined to users. This
--           adds a weighted tsvector and a trigram-indexed text column, both
--           kept current by triggers, so the same searches are index-backed
--           and can be ranked by relevance instead of alphabetically.
--
--   REQ-08  Career Progression Tracker. employment_history is the opt-in,
--           self-reported employment timeline the PRD's open-questions matrix
--           approved ("Opt-in self-reporting with AI enrichment"). There is
--           deliberately no scraping and no scheduled enrichment job here:
--           neither exists in this codebase and neither is being claimed.
--
-- Run with:  node scripts/migrate-v9.js
-- Requires PostgreSQL 14+ for CREATE OR REPLACE TRIGGER (production is 18.6).
-- ============================================================


-- ============================================================
-- PART 1 — REQ-03: DIRECTORY SEARCH
-- ============================================================

-- Trigram matching. pg_trgm is a *trusted* extension from PostgreSQL 13
-- onward, so the database owner can install it without superuser rights —
-- verified available on the production instance (pg_trgm 1.6, not yet
-- installed). It backs both the fuzzy `<%` operator and the substring ILIKE
-- that preserves the old LIKE behaviour.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Two derived columns rather than one. They answer different questions and
-- need different index types:
--   search_text   — the raw searchable text, one field per line. Serves
--                   substring (ILIKE '%…%') and fuzzy word matching, via GIN
--                   trigram. This is what makes partial words and misspellings
--                   work; a tsvector cannot do either.
--   search_vector — lexemes with A/B/C/D weights, so a name hit outranks a
--                   skills hit. Serves ranked whole-word search via GIN.
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS search_text TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- The searchable text, assembled from the same columns the old LIKE scanned
-- (full_name, current_company, skills, department, job_title, city, batch)
-- plus industry, country, degree and occupation, which the structured filters
-- already expose but free-text search could not reach.
--
-- Fields are newline-separated so a query cannot match across a field
-- boundary — 'Dhaka\nEngineer' must not satisfy a search for "Dhaka Engineer"
-- when neither field contains that phrase. NULL and empty fields drop out
-- entirely (array_to_string skips NULLs) so there are no separator runs.
CREATE OR REPLACE FUNCTION dic_alumni_search_text(
  p_name       TEXT,
  p_company    TEXT,
  p_job_title  TEXT,
  p_skills     TEXT,
  p_department TEXT,
  p_industry   TEXT,
  p_city       TEXT,
  p_country    TEXT,
  p_degree     TEXT,
  p_occupation TEXT,
  p_batch      INT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_to_string(ARRAY[
    NULLIF(btrim(COALESCE(p_name,       '')), ''),
    NULLIF(btrim(COALESCE(p_company,    '')), ''),
    NULLIF(btrim(COALESCE(p_job_title,  '')), ''),
    NULLIF(btrim(COALESCE(p_skills,     '')), ''),
    NULLIF(btrim(COALESCE(p_department, '')), ''),
    NULLIF(btrim(COALESCE(p_industry,   '')), ''),
    NULLIF(btrim(COALESCE(p_city,       '')), ''),
    NULLIF(btrim(COALESCE(p_country,    '')), ''),
    NULLIF(btrim(COALESCE(p_degree,     '')), ''),
    NULLIF(btrim(COALESCE(p_occupation, '')), ''),
    p_batch::TEXT
  ], E'\n')
$$;

-- The weighted lexeme vector.
--
-- Dictionary choice: 'simple', not 'english'. This is a deliberate tradeoff,
-- not an oversight:
--   * The corpus is Bangladeshi names, employer names and job titles. English
--     stemming mangles proper nouns ("Systems" -> "system" is harmless,
--     "Rahman" and "Daffodil" are not words it should be guessing about) and
--     it does nothing useful for a corpus that is largely identifiers.
--   * PostgreSQL ships no Bangla stemmer or stopword list (the installed
--     configurations are: arabic … yiddish; Bangla is not among them). Under
--     'english' a Bangla token is passed through unstemmed anyway, so the
--     English config buys nothing for mixed-script input and costs correctness
--     on the English half.
--   * 'simple' therefore indexes every token lowercased and verbatim, in both
--     scripts, with no stemming and no language guess.
-- The honest consequence: this is exact-token matching, so "engineers" does
-- not find "engineer" through the tsvector. The trigram path below is what
-- covers partial words, plurals and typos — the two indexes are complements,
-- and neither one alone is sufficient.
--
-- Weights follow ts_rank's defaults {D,C,B,A} = {0.1, 0.2, 0.4, 1.0}:
--   A  name                                   — who you are
--   B  employer, job title                    — what you do now
--   C  skills, department, industry           — what you know
--   D  city, country, degree, occupation, batch — where/when
CREATE OR REPLACE FUNCTION dic_alumni_search_vector(
  p_name       TEXT,
  p_company    TEXT,
  p_job_title  TEXT,
  p_skills     TEXT,
  p_department TEXT,
  p_industry   TEXT,
  p_city       TEXT,
  p_country    TEXT,
  p_degree     TEXT,
  p_occupation TEXT,
  p_batch      INT
) RETURNS TSVECTOR
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('simple', COALESCE(p_name, '')), 'A')
      || setweight(to_tsvector('simple', array_to_string(ARRAY[p_company, p_job_title], ' ')), 'B')
      || setweight(to_tsvector('simple', array_to_string(ARRAY[p_skills, p_department, p_industry], ' ')), 'C')
      || setweight(to_tsvector('simple', array_to_string(
             ARRAY[p_city, p_country, p_degree, p_occupation, p_batch::TEXT], ' ')), 'D')
$$;

-- Keeps both derived columns in step with the profile row.
--
-- full_name lives in users, not alumni_profiles, which rules out a STORED
-- generated column (those may only read their own row). A BEFORE trigger that
-- looks the name up is the alternative that keeps the columns correct on every
-- write without any application code having to remember to maintain them —
-- important, because profiles are written from at least four places (profile
-- self-service, bulk import, seed, admin edits).
CREATE OR REPLACE FUNCTION dic_alumni_profiles_search_sync() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT full_name INTO v_name FROM users WHERE id = NEW.user_id;

  NEW.search_text := dic_alumni_search_text(
    v_name, NEW.current_company, NEW.job_title, NEW.skills, NEW.department,
    NEW.industry, NEW.city, NEW.country, NEW.degree, NEW.occupation, NEW.batch);

  NEW.search_vector := dic_alumni_search_vector(
    v_name, NEW.current_company, NEW.job_title, NEW.skills, NEW.department,
    NEW.industry, NEW.city, NEW.country, NEW.degree, NEW.occupation, NEW.batch);

  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_alumni_profiles_search_sync
  BEFORE INSERT OR UPDATE ON alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION dic_alumni_profiles_search_sync();

-- A rename in users must re-index the profile, or the directory keeps finding
-- people under their old name. This touches the profile row and lets the
-- BEFORE trigger above do the recomputation, so the weighting rules exist in
-- exactly one place. `updated_at = updated_at` is a genuine row update that
-- changes no user-visible value.
CREATE OR REPLACE FUNCTION dic_users_search_sync() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE alumni_profiles SET updated_at = updated_at WHERE user_id = NEW.id;
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER trg_users_search_sync
  AFTER UPDATE OF full_name ON users
  FOR EACH ROW WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name)
  EXECUTE FUNCTION dic_users_search_sync();

-- GIN over the lexemes: ranked whole-token search.
CREATE INDEX IF NOT EXISTS idx_profiles_search_vector
  ON alumni_profiles USING GIN (search_vector);

-- GIN over trigrams: ILIKE '%term%' (the old behaviour, now index-backed) and
-- the `<%` word-similarity operator (typo tolerance). Terms shorter than three
-- characters still fall back to a scan — a two-character substring has no
-- trigram the index can look up. At 194 rows that is not a problem; it is
-- named here so nobody later reads the index as a guarantee it is not.
CREATE INDEX IF NOT EXISTS idx_profiles_search_trgm
  ON alumni_profiles USING GIN (search_text gin_trgm_ops);

-- Backfill existing rows through the trigger. Guarded on search_vector IS NULL
-- so re-running this file is a no-op rather than a full table rewrite.
UPDATE alumni_profiles SET updated_at = updated_at WHERE search_vector IS NULL;


-- ============================================================
-- PART 2 — REQ-08: CAREER PROGRESSION TRACKER
-- ============================================================

-- Self-reported employment timeline. One row per position held.
--
-- ON DELETE CASCADE matches every other user-owned table in this schema: a
-- deleted account takes its employment history with it, which is also what the
-- PDPA deletion path in the compliance module needs.
CREATE TABLE IF NOT EXISTS employment_history (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company     VARCHAR(255) NOT NULL,
    job_title   VARCHAR(255) NOT NULL,
    industry    VARCHAR(150),
    location    VARCHAR(255),
    start_date  DATE NOT NULL,
    end_date    DATE,              -- NULL = still there
    is_current  BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- A position cannot end before it began.
    CONSTRAINT employment_dates_ordered
      CHECK (end_date IS NULL OR end_date >= start_date),

    -- "Current" and "ended on a date" are contradictory claims. Enforced here
    -- rather than left to the API, because bulk import and any future admin
    -- tooling write this table too.
    CONSTRAINT employment_current_has_no_end
      CHECK (NOT is_current OR end_date IS NULL)
);

-- Timeline reads: every query against this table is "one user's history,
-- newest first".
CREATE INDEX IF NOT EXISTS idx_employment_user
  ON employment_history (user_id, start_date DESC);

-- At most one current position per user. A partial unique index rather than a
-- CHECK, because the constraint is across rows. This is what keeps
-- alumni_profiles.current_company — which the directory index above reads —
-- unambiguous: there is exactly one row that can be the source of truth for it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employment_current_per_user
  ON employment_history (user_id) WHERE is_current;
