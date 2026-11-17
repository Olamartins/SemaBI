export type Period = string; // "YYYY-MM"

export type AppRole = "CRO" | "ALCO" | "CFO" | "RISK" | "CREDIT_COMMITTEE" | "BI_ADMIN";

export type Severity = "critical" | "high" | "medium" | "low";

export type MappingStatus = "draft" | "certified";

export type InsightStatus = "new" | "acknowledged" | "assigned" | "resolved";

export interface AggregateRecord {
  concept: string; // ontology concept key, e.g. "asset_quality.npl_ratio"
  dimensions: Record<string, string>; // e.g. { segment: "SME" }
  period: Period;
  value: number;
  unit: string; // "%", "pp", "NGN bn", "x", "days"
  sourceMeasure: string; // certified Power BI measure the value came from
  ingestedAt: string; // ISO timestamp
}

export interface NumericClaim {
  text: string; // sentence containing the number
  value: number;
  unit: string;
  measure: string; // ontology concept or PBI measure the claim cites
  period: Period;
  verified: boolean;
}

export interface EvidenceLink {
  label: string;
  concept: string;
  measure: string;
  period: Period;
  value: number;
  unit: string;
  reportUrl?: string;
  page?: string;
}

export interface Insight {
  id: string;
  ruleId: string;
  domain: string;
  severity: Severity;
  title: string;
  narrative: string; // post-validation: contains only verified numbers
  claims: NumericClaim[];
  evidence: EvidenceLink[];
  owner: string;
  routeTo: AppRole[];
  confidence: number; // 0..1
  status: InsightStatus;
  assignedTo?: string;
  createdPeriod: Period;
  createdAt: string;
  reportUrl?: string;
  diagnostics: Record<string, unknown>; // chart-ready payload for playbook views
}

export interface Mapping {
  concept: string;
  status: MappingStatus;
  measureName: string | null; // Power BI measure mapped to the concept
  daxExpression: string | null; // suggested DAX when no measure exists (gap remediation)
  dimensions: Record<string, string>; // ontology dimension -> model column
  autoSuggested: boolean;
  certifiedBy?: string;
  certifiedAt?: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string; // e.g. "pbi.query", "insight.publish", "insight.acknowledge"
  detail: Record<string, unknown>;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface PbiDataset {
  id: string;
  name: string;
  workspaceId: string;
  isCertified: boolean;
  configuredRefreshSchedule?: string;
}

export interface PbiReport {
  id: string;
  name: string;
  datasetId: string;
  webUrl: string;
}

export interface SemanticModelMetadata {
  datasetId: string;
  tables: { name: string; columns: { name: string; dataType: string }[] }[];
  measures: { name: string; dax: string; description?: string }[];
  relationships: { fromTable: string; fromColumn: string; toTable: string; toColumn: string }[];
}

export interface AggregateQuery {
  measure: string; // DAX measure name in the semantic model
  concept: string; // ontology concept this aggregate feeds
  from: Period;
  to: Period;
  groupBy?: string[]; // model columns to decompose by
  filters?: Record<string, string>;
}

export interface PbiClient {
  readonly mode: "mock" | "powerbi";
  listWorkspaces(identity: EffectiveIdentity): Promise<Workspace[]>;
  listDatasets(identity: EffectiveIdentity, workspaceId: string): Promise<PbiDataset[]>;
  listReports(identity: EffectiveIdentity, workspaceId: string): Promise<PbiReport[]>;
  getMetadata(identity: EffectiveIdentity, datasetId: string): Promise<SemanticModelMetadata>;
  executeAggregate(identity: EffectiveIdentity, datasetId: string, query: AggregateQuery): Promise<AggregateRecord[]>;
  getReportUrl(datasetId: string, reportId?: string): string;
}

export interface EffectiveIdentity {
  userId: string;
  displayName: string;
  roles: AppRole[];
  /** Row-level security filters enforced by the tenant (applied by Power BI, never bypassed here). */
  rls: {
    geographies?: string[];
    segments?: string[];
  };
  mode: "delegated" | "service-principal";
}

export interface RuleParameters {
  // CBN prudential reference thresholds - configurable, never hardcoded in rules.
  nplThresholdPct: number; // 5
  carMinimumPct: number; // 10 (+ risk-based add-ons per CBN Mar-2026 framework)
  carRiskAddOnPct: number; // e.g. 2.5 for elevated risk profile
  cet1MinimumPct: number; // 10.5
  liquidityRatioMinimumPct: number; // 30
  lcrMinimumPct: number; // 100
  singleObligorLimitPctOfFunds: number; // 20
  insiderSingleObligorLimitPctOfFunds: number; // 5
  // Detector trigger parameters
  nplDriftBreachPct: number; // trigger when NPL > nplThresholdPct
  nplDriftRisePp90d: number; // 1.0
  stage2RisePp6m: number; // 1.5
  stage2CorLagPp: number; // 0.5
  nimCompressionPp6m: number; // 0.4
  capitalBreachHorizonMonths: number; // 18
  fundingTermShiftPp12m: number; // 5
  fundingTotalDriftPct: number; // 2
  concentrationTop10RisePp90d: number; // 3
  singleObligorApproachPctOfLimit: number; // 90
  depositTotalConcept: string;
  // Appetite
  top10ObligorAppetitePct: number; // 40
}

export interface DetectContext {
  store: import("./store/repository.ts").Repository;
  mappings: Mapping[];
  thresholds: RuleParameters;
  now: Period;
  pbi: PbiClient;
  datasetId: string;
  identity: EffectiveIdentity;
  audit: (action: string, detail: Record<string, unknown>) => Promise<void>;
}

export interface TriggerResult {
  severity: Severity;
  headlineFacts: { label: string; value: number; unit: string; concept: string; period: Period }[];
}

export interface Diagnostics {
  evidence: EvidenceLink[];
  charts: Record<string, unknown>;
  facts: { label: string; value: number; unit: string; concept: string; period: Period }[];
  routing: { owner: string; routeTo: AppRole[] };
}

export interface Rule {
  id: string;
  domain: string;
  title: string;
  description: string;
  trigger(ctx: DetectContext): Promise<TriggerResult | null>;
  diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics>;
}
