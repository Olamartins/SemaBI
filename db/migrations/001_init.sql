-- SemaBI schema. Aggregates only — no row-level customer data is ever persisted.
CREATE TABLE IF NOT EXISTS aggregates (
  concept        TEXT NOT NULL,
  dimensions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  period         TEXT NOT NULL,              -- "YYYY-MM"
  value          DOUBLE PRECISION NOT NULL,
  unit           TEXT NOT NULL,
  source_measure TEXT NOT NULL,              -- certified Power BI measure
  ingested_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (concept, dimensions, period, source_measure)
);
CREATE INDEX IF NOT EXISTS idx_aggregates_concept_period ON aggregates (concept, period);

CREATE TABLE IF NOT EXISTS insights (
  id             TEXT PRIMARY KEY,
  rule_id        TEXT NOT NULL,
  domain         TEXT NOT NULL,
  severity       TEXT NOT NULL,
  title          TEXT NOT NULL,
  narrative      TEXT NOT NULL,
  claims         JSONB NOT NULL,
  evidence       JSONB NOT NULL,
  owner          TEXT NOT NULL,
  route_to       JSONB NOT NULL,
  confidence     DOUBLE PRECISION NOT NULL,
  status         TEXT NOT NULL DEFAULT 'new',
  assigned_to    TEXT,
  created_period TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  report_url     TEXT,
  diagnostics    JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_insights_rule ON insights (rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_status ON insights (status);

CREATE TABLE IF NOT EXISTS mappings (
  concept        TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'draft',   -- draft | certified
  measure_name   TEXT,
  dax_expression TEXT,
  dimensions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_suggested BOOLEAN NOT NULL DEFAULT false,
  certified_by   TEXT,
  certified_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     TEXT PRIMARY KEY,
  at     TIMESTAMPTZ NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at DESC);

CREATE TABLE IF NOT EXISTS freshness (
  concept TEXT PRIMARY KEY,
  period  TEXT NOT NULL,
  at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_users (
  user_id      TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  roles        JSONB NOT NULL DEFAULT '[]'::jsonb,
  rls          JSONB NOT NULL DEFAULT '{}'::jsonb,
  mode         TEXT NOT NULL DEFAULT 'delegated'
);
