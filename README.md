# SemaBI — AI Banking Insight Engine

SemaBI adds a domain-specific AI insight layer on top of a commercial bank's existing
Power BI estate (Nigeria / CBN prudential context). It does **not** replace Power BI: it
reads certified semantic models, applies banking-domain analytical intelligence, and
pushes decision-ready insights to executives before they open a dashboard.

## Pillars

1. **Connect** — Entra ID (MSAL) auth (service principal or delegated OBO), workspace /
   dataset / report listing, semantic-model metadata (tables, columns, measures, DAX,
   relationships) via official Power BI REST APIs, scheduled aggregate DAX queries.
2. **Map** — guided mapping of the bank's measures onto a built-in banking ontology
   (CBN concepts) with fuzzy auto-suggest + human confirmation, draft → certified
   workflow, and concrete DAX gap remediation for missing measures.
3. **Analyze** — pluggable detection engine (6 v1 playbooks) + LLM narratives (Mistral by
   default, configurable) grounded **only** in retrieved aggregates, mappings and detector
   outputs. Every numeric claim is re-validated against the aggregate store before
   publishing; LLM failure degrades to template narratives.
4. **Deliver** — morning digest (UI + email via Resend + Teams adaptive cards), role
   filters (CRO / ALCO / CFO / Risk / Credit Committee), acknowledge → assign action loop.

## Quick start (demo mode, no tenant needed)

```bash
npm install
npm run dev          # http://localhost:3000  → pick a persona on /login
npm test             # 30 unit/integration/e2e tests (node:test, no infra needed)
npm run typecheck
```

Demo mode ships a mocked Power BI tenant (`lib/pbi/mock.ts`) backed by a deterministic
24-month mock bank (`lib/seed/bank.ts`, "First Meridian Bank") with a realistic risk
story: NPL breaches the 5% CBN ceiling with the final spike driven by post-forbearance
reclassification, Stage 2 builds while cost of risk lags, NIM compresses on funding cost,
CAR erodes toward the minimum + add-on, deposit mix shifts to term at stable totals, and
top-10 obligor concentration creeps past appetite. On first load the app runs
connect → map → ingest → detect automatically; open **/digest** as the CRO persona.

## Production mode

```bash
SEMABI_MODE=prod npm start   # with .env from .env.example
```

- **Auth**: OIDC SSO via Microsoft Entra ID (app roles CRO/ALCO/CFO/RISK/BI_ADMIN/
  CREDIT_COMMITTEE mapped to entitlements). Power BI queries execute under the signed-in
  user's effective identity (delegated OBO token) unless the workspace is configured for
  service-principal access, in which case the service principal impersonates the user
  (`impersonatedUserName` on ExecuteQueries) so **RLS is always applied by the tenant**.
- **Datastores**: PostgreSQL (metadata, mappings, insights, audit; aggregates with 24-month
  retention) — TimescaleDB-compatible schema in `db/migrations/001_init.sql`; Redis +
  BullMQ for scheduling (nightly ingest 05:30, digest 07:00).
- **LLM**: `LLM_PROVIDER=mistral` (default), `LLM_BASE_URL`/`LLM_MODEL`/`MISTRAL_API_KEY`
  configurable. Prompts are version-controlled in `prompts/narrative/*.v1.md`.
- **Infra**: `Dockerfile` + `docker-compose.yml` (app + TimescaleDB + Redis) and
  `infra/main.bicep` for one-tenant-per-bank Azure isolation (App Service + Azure
  PostgreSQL Flexible Server + Azure Cache for Redis + Key Vault + App Insights).

## Security & data governance

- **RLS is sacred**: `lib/pbi/identity.ts` fails closed — every Power BI call requires an
  effective identity (`MissingIdentityError` otherwise). Tests in `tests/rls.test.ts`
  verify that no query path can run without identity propagation and that RLS-restricted
  identities only receive in-scope rows.
- **No raw data**: only SUMMARIZE aggregates are queried and persisted; retention is
  configurable (`AGGREGATE_RETENTION_MONTHS`, default 24) and enforced by pruning.
- **Audit**: every tenant query, insight publication, acknowledgment and assignment is
  written to the audit log (visible to BI_ADMIN in Admin).
- **Numeric integrity**: `lib/narrative/validator.ts` re-checks every numeric claim in a
  narrative against the aggregate store; unverifiable sentences are stripped before
  publishing.

## Architecture

```
app/            Next.js 14 App Router UI + API routes (TypeScript, Tailwind, Recharts)
lib/
  pbi/          identity/RLS guard, mock connector, MSAL+REST client (official APIs only)
  ontology/     banking ontology (5 domains, 26 concepts) + configurable CBN thresholds
  mapping/      auto-suggest (fuzzy), certification workflow, DAX gap remediation
  ingest/       nightly aggregate pipeline (idempotent upserts) + scheduler (BullMQ opt.)
  detect/       rule framework + 6 playbooks (trigger → diagnostics → narrative → route)
  narrative/    provider iface, Mistral, template fallback, numeric-claim validator
  notify/       digest composer, Resend email, Teams adaptive cards
  store/        repository iface + in-memory (demo) + PostgreSQL (prod)
  demo/         bootstrap runtime (mock tenant end-to-end)
tests/          node:test — detectors, RLS, validator, mapping, mock-PBI, e2e happy path
config/rules.default.json   CBN reference thresholds + detector params (config, not code)
prompts/        version-controlled LLM prompts
infra/          Bicep (Azure) — Dockerfile/docker-compose for containers
db/migrations/  PostgreSQL schema (aggregates only)
```

## The six v1 playbooks (`lib/detect/rules/`)

| Rule | Trigger | Routes to |
|---|---|---|
| `npl-drift` | NPL > 5% CBN ceiling or ≥1pp/90d; separates reclassification vs new defaults, segment + vintage + seasonality | CRO Office, segment heads |
| `stage2-leading` | Stage 2 up materially while cost of risk lags → ECL catch-up risk | Head of Credit Risk |
| `nim-compression` | NIM down ≥ threshold/6m; asset-yield vs funding-cost decomposition | Treasury / ALCO |
| `capital-trajectory` | Linear CAR projection vs minimum + risk add-on; breach horizon < 18m | CFO |
| `funding-erosion` | Deposit-mix shift at stable totals; earnings vs solvency via liquidity ratio | ALCO |
| `concentration-creep` | Top-10 trend vs appetite; single-obligor approach-to-limit | Credit Risk Committee |

## API summary

`GET /api/health` · `POST /api/auth/demo` (demo persona) · `GET /api/pbi/workspaces` ·
`GET /api/pbi/datasets?workspaceId=` · `GET /api/pbi/datasets/[id]/metadata` ·
`POST /api/pbi/query` (aggregate DAX under effective identity) · `POST|GET /api/ingest/run` ·
`POST|GET /api/detect/run` · `GET /api/insights?role=&ruleId=` ·
`POST /api/insights/[id]/acknowledge` · `POST /api/insights/[id]/assign` ·
`GET|POST /api/mapping` · `GET|PUT /api/mapping/[concept]` · `GET /api/digest?role=&send=1` ·
`GET /api/admin/audit` · `GET|POST /api/admin/settings`

## Definition of done (v1)

A bank's BI admin can register the tenant, select a certified dataset, complete ontology
mapping in under 2 hours, and the next morning the CRO receives a Teams digest in which
every number traces to a certified Power BI measure, the NPL insight correctly separates
reclassification from new defaults, and every query respected row-level security.
