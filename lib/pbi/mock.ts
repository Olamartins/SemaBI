import type {
  AggregateQuery,
  AggregateRecord,
  EffectiveIdentity,
  PbiClient,
  PbiDataset,
  PbiReport,
  SemanticModelMetadata,
  Workspace,
} from "../types.ts";
import { requireIdentity } from "./identity.ts";
import { generateSeedBank, MEASURE_NAMES } from "../seed/bank.ts";
import type { SeedBank } from "../seed/bank.ts";
import { deepKey } from "../util.ts";
import { currentPeriod } from "../util.ts";

export interface MockAuditSink {
  (entry: { actor: string; action: string; detail: Record<string, unknown> }): void;
}

/**
 * Mocked Power BI tenant for demo mode and tests. It mimics the certified semantic
 * model of the seed bank: metadata (tables/columns/measures/relationships) plus an
 * aggregate DAX executor. Like the real tenant, it enforces row-level security:
 * identities carrying RLS segment/geography restrictions only receive rows inside
 * their scope, and queries without an identity are rejected.
 */
export class MockPowerBiClient implements PbiClient {
  readonly mode = "mock" as const;
  private bank: SeedBank;
  private audit?: MockAuditSink;

  constructor(endPeriod: string = currentPeriod(), audit?: MockAuditSink) {
    this.bank = generateSeedBank(endPeriod);
    this.audit = audit;
  }

  get seed(): SeedBank {
    return this.bank;
  }

  private record(identity: EffectiveIdentity, action: string, detail: Record<string, unknown>) {
    this.audit?.({ actor: identity.userId, action, detail: { ...detail, mode: identity.mode, rls: identity.rls } });
  }

  async listWorkspaces(identity: EffectiveIdentity): Promise<Workspace[]> {
    requireIdentity(identity);
    this.record(identity, "pbi.listWorkspaces", {});
    return [{ id: "ws-commercial-prod", name: "Commercial Banking - Production" }];
  }

  async listDatasets(identity: EffectiveIdentity, workspaceId: string): Promise<PbiDataset[]> {
    requireIdentity(identity);
    this.record(identity, "pbi.listDatasets", { workspaceId });
    return [
      {
        id: "ds-certified-banking-model",
        name: "Certified Banking Semantic Model",
        workspaceId,
        isCertified: true,
        configuredRefreshSchedule: "05:30",
      },
      { id: "ds-branch-ops", name: "Branch Operations (uncertified)", workspaceId, isCertified: false },
    ];
  }

  async listReports(identity: EffectiveIdentity, workspaceId: string): Promise<PbiReport[]> {
    requireIdentity(identity);
    this.record(identity, "pbi.listReports", { workspaceId });
    return [
      {
        id: "rpt-credit-risk",
        name: "Credit Risk & Asset Quality",
        datasetId: "ds-certified-banking-model",
        webUrl: "https://app.powerbi.com/groups/ws-commercial-prod/reports/rpt-credit-risk",
      },
      {
        id: "rpt-alco",
        name: "ALCO - Funding & Liquidity",
        datasetId: "ds-certified-banking-model",
        webUrl: "https://app.powerbi.com/groups/ws-commercial-prod/reports/rpt-alco",
      },
    ];
  }

  async getMetadata(identity: EffectiveIdentity, datasetId: string): Promise<SemanticModelMetadata> {
    requireIdentity(identity);
    this.record(identity, "pbi.getMetadata", { datasetId });
    const measures: { name: string; dax: string; description?: string }[] = Object.values(MEASURE_NAMES).map((name) => ({
      name,
      dax: `[${name}] -- certified measure in ${datasetId}`,
      description: `Certified measure: ${name}`,
    }));
    // A few decoy measures so auto-suggest has to rank, not just exact-match.
    measures.push(
      { name: "NPL Balance (NGN bn)", dax: "SUM(Loans[NPL Balance]) / 1e9", description: "Stock of non-performing loans, not a ratio" },
      { name: "Gross Loans (NGN bn)", dax: "SUM(Loans[Exposure]) / 1e9" },
      { name: "Loan Growth YoY (%)", dax: "DIVIDE([Gross Loans], CALCULATE([Gross Loans], SAMEPERIODLASTYEAR(Period[Date])), 0) - 1" },
      { name: "CAR (regulatory, incl. add-on)", dax: "DIVIDE([Qualifying Capital], [RWA], 0) * 100" },
    );
    return {
      datasetId,
      tables: [
        { name: "Loans", columns: [{ name: "Loan ID", dataType: "string" }, { name: "Exposure", dataType: "double" }, { name: "Segment", dataType: "string" }, { name: "Sector", dataType: "string" }, { name: "IFRS9 Stage", dataType: "string" }, { name: "Cohort", dataType: "string" }, { name: "Forborne Flag", dataType: "string" }] },
        { name: "Deposits", columns: [{ name: "Balance", dataType: "double" }, { name: "Deposit Type", dataType: "string" }] },
        { name: "Period", columns: [{ name: "Date", dataType: "dateTime" }, { name: "Month", dataType: "string" }] },
        { name: "Obligors", columns: [{ name: "Obligor ID", dataType: "string" }, { name: "Exposure", dataType: "double" }, { name: "Sector", dataType: "string" }, { name: "Insider Flag", dataType: "string" }] },
        { name: "Capital", columns: [{ name: "Qualifying Capital", dataType: "double" }, { name: "RWA", dataType: "double" }, { name: "CET1", dataType: "double" }] },
      ],
      measures,
      relationships: [
        { fromTable: "Loans", fromColumn: "Date", toTable: "Period", toColumn: "Date" },
        { fromTable: "Obligors", fromColumn: "Sector", toTable: "Loans", toColumn: "Sector" },
      ],
    };
  }

  /**
   * Aggregate DAX executor (mock). Supports the shape SemaBI issues: a certified
   * measure evaluated over a period range, optionally grouped by dimensions.
   * Enforces RLS: restricted identities never see out-of-scope segment rows.
   */
  async executeAggregate(identity: EffectiveIdentity, datasetId: string, query: AggregateQuery): Promise<AggregateRecord[]> {
    requireIdentity(identity);
    const measure = Object.entries(MEASURE_NAMES).find(([, v]) => v === query.measure);
    if (!measure) throw new Error(`Unknown measure '${query.measure}' in dataset ${datasetId}`);
    const conceptKey = measure[0].replace(/_/g, ".").replace(/^([a-z]+)\./, (m) => m); // not used for lookup; lookup by measure name below
    void conceptKey;
    this.record(identity, "pbi.executeAggregate", {
      datasetId,
      measure: query.measure,
      from: query.from,
      to: query.to,
      groupBy: query.groupBy ?? [],
      rlsApplied: true,
    });
    const concept = conceptForMeasure(query.measure);
    const rows = this.bank.records.filter(
      (r) => r.sourceMeasure === query.measure && r.period >= query.from && r.period <= query.to,
    );
    const filtered = rows.filter((r) => {
      if (identity.rls.segments && r.dimensions.segment && !identity.rls.segments.includes(r.dimensions.segment)) return false;
      if (identity.rls.geographies && r.dimensions.geography && !identity.rls.geographies.includes(r.dimensions.geography)) return false;
      return true;
    });
    return filtered.map((r) => ({ ...r, dimensions: { ...r.dimensions }, ingestedAt: new Date().toISOString() }));
  }

  getReportUrl(datasetId: string, reportId?: string): string {
    const base = "https://app.powerbi.com/groups/ws-commercial-prod/reports";
    return reportId ? `${base}/${reportId}` : `${base}/rpt-credit-risk?dataset=${datasetId}`;
  }

  /** Test helper: all raw rows for a measure (what an unrestricted admin sees). */
  rawRows(measure: string): AggregateRecord[] {
    return this.bank.records.filter((r) => r.sourceMeasure === measure).map((r) => ({ ...r }));
  }

  static dimsKey(dims: Record<string, string>): string {
    return deepKey(dims);
  }
}

const MEASURE_TO_CONCEPT: Record<string, string> = {
  [MEASURE_NAMES.npl_ratio]: "asset_quality.npl_ratio",
  [MEASURE_NAMES.npl_by_segment]: "asset_quality.npl_by_segment",
  [MEASURE_NAMES.stage2_ratio]: "asset_quality.stage2_ratio",
  [MEASURE_NAMES.stage_migration]: "asset_quality.stage_migration",
  [MEASURE_NAMES.reclassified_forborne]: "asset_quality.reclassified_forborne",
  [MEASURE_NAMES.watchlist_growth]: "asset_quality.watchlist_growth",
  [MEASURE_NAMES.new_defaults]: "asset_quality.new_defaults",
  [MEASURE_NAMES.cost_of_risk]: "asset_quality.cost_of_risk",
  [MEASURE_NAMES.provision_coverage]: "asset_quality.provision_coverage",
  [MEASURE_NAMES.vintage_default_curves]: "asset_quality.vintage_default_curves",
  [MEASURE_NAMES.car]: "capital.car",
  [MEASURE_NAMES.cet1_ratio]: "capital.cet1_ratio",
  [MEASURE_NAMES.capital_consumption_run_rate]: "capital.capital_consumption_run_rate",
  [MEASURE_NAMES.rwa_growth]: "capital.rwa_growth",
  [MEASURE_NAMES.liquidity_ratio]: "liquidity.liquidity_ratio",
  [MEASURE_NAMES.lcr]: "liquidity.lcr",
  [MEASURE_NAMES.crr_position]: "liquidity.crr_position",
  [MEASURE_NAMES.ldr]: "liquidity.ldr",
  [MEASURE_NAMES.deposit_mix]: "liquidity.deposit_mix",
  [MEASURE_NAMES.deposit_total]: "liquidity.deposit_total",
  [MEASURE_NAMES.cost_of_deposits]: "liquidity.cost_of_deposits",
  [MEASURE_NAMES.nim]: "profitability.nim",
  [MEASURE_NAMES.asset_yield]: "profitability.asset_yield",
  [MEASURE_NAMES.funding_cost]: "profitability.funding_cost",
  [MEASURE_NAMES.cost_to_income]: "profitability.cost_to_income",
  [MEASURE_NAMES.non_interest_income_share]: "profitability.non_interest_income_share",
  [MEASURE_NAMES.top10_obligor_share]: "concentration.top10_obligor_share",
  [MEASURE_NAMES.single_obligor_pct]: "concentration.single_obligor_pct",
  [MEASURE_NAMES.sector_concentration]: "concentration.sector_concentration",
};

export function conceptForMeasure(measure: string): string {
  const c = MEASURE_TO_CONCEPT[measure];
  if (!c) throw new Error(`Measure '${measure}' is not a mapped seed measure`);
  return c;
}
