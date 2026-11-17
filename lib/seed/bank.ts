import type { AggregateRecord, Period } from "../types.ts";
import { mulberry32, periodRange, round, currentPeriod } from "../util.ts";

/**
 * Canonical Power BI measure names in the mocked certified semantic model.
 * The mapping auto-suggest engine matches ontology concepts against these.
 */
export const MEASURE_NAMES = {
  npl_ratio: "NPL Ratio (%)",
  npl_by_segment: "NPL Ratio by Segment (%)",
  stage2_ratio: "Stage 2 Loans % of Gross Loans",
  stage_migration: "Stage Migration Contribution (pp)",
  reclassified_forborne: "Reclassified Forborne Contribution (pp)",
  watchlist_growth: "Watchlist Growth Contribution (pp)",
  new_defaults: "New Defaults Contribution (pp)",
  cost_of_risk: "Cost of Risk (ann., %)",
  provision_coverage: "Provision Coverage (%)",
  vintage_default_curves: "Vintage Default Rate (%)",
  car: "Capital Adequacy Ratio (%)",
  cet1_ratio: "CET1 Ratio (%)",
  capital_consumption_run_rate: "Capital Consumption Run-Rate (pp/qtr)",
  rwa_growth: "RWA Growth QoQ (%)",
  liquidity_ratio: "Liquidity Ratio (%)",
  lcr: "LCR (%)",
  crr_position: "CRR Position (%)",
  ldr: "Loan-to-Deposit Ratio (%)",
  deposit_mix: "Deposit Mix (%)",
  deposit_total: "Total Deposits (NGN bn)",
  cost_of_deposits: "Cost of Deposits (%)",
  nim: "Net Interest Margin (%)",
  asset_yield: "Asset Yield (%)",
  funding_cost: "Cost of Funds (%)",
  cost_to_income: "Cost-to-Income (%)",
  non_interest_income_share: "Non-Interest Income Share (%)",
  top10_obligor_share: "Top-10 Obligor Share (%)",
  single_obligor_pct: "Single Obligor % of Funds",
  sector_concentration: "Sector Concentration (%)",
} as const;

export type SeedConcept = keyof typeof MEASURE_NAMES;

export interface SeedBank {
  bankName: string;
  endPeriod: Period;
  periods: Period[];
  records: AggregateRecord[];
}

const SEGMENTS = ["SME", "Retail", "Corporate", "Oil & Gas", "Agriculture"];
const DEPOSIT_TYPES = ["Demand", "Savings", "Term"];
const SECTORS = ["Oil & Gas", "Manufacturing", "Trade", "Real Estate", "Agriculture", "Power", "Other"];
const COHORTS = ["2023", "2024", "2025"];

function records(
  periods: Period[],
  concept: SeedConcept,
  values: number[],
  unit: string,
  dimensions: Record<string, string> = {},
  ingestedAt: string,
): AggregateRecord[] {
  return periods.map((p, i) => ({
    concept: conceptKey(concept),
    dimensions,
    period: p,
    value: round(values[i], 4),
    unit,
    sourceMeasure: MEASURE_NAMES[concept],
    ingestedAt,
  }));
}

function conceptKey(c: SeedConcept): string {
  const map: Record<string, string> = {
    npl_ratio: "asset_quality.npl_ratio",
    npl_by_segment: "asset_quality.npl_by_segment",
    stage2_ratio: "asset_quality.stage2_ratio",
    stage_migration: "asset_quality.stage_migration",
    reclassified_forborne: "asset_quality.reclassified_forborne",
    watchlist_growth: "asset_quality.watchlist_growth",
    new_defaults: "asset_quality.new_defaults",
    cost_of_risk: "asset_quality.cost_of_risk",
    provision_coverage: "asset_quality.provision_coverage",
    vintage_default_curves: "asset_quality.vintage_default_curves",
    car: "capital.car",
    cet1_ratio: "capital.cet1_ratio",
    capital_consumption_run_rate: "capital.capital_consumption_run_rate",
    rwa_growth: "capital.rwa_growth",
    liquidity_ratio: "liquidity.liquidity_ratio",
    lcr: "liquidity.lcr",
    crr_position: "liquidity.crr_position",
    ldr: "liquidity.ldr",
    deposit_mix: "liquidity.deposit_mix",
    deposit_total: "liquidity.deposit_total",
    cost_of_deposits: "liquidity.cost_of_deposits",
    nim: "profitability.nim",
    asset_yield: "profitability.asset_yield",
    funding_cost: "profitability.funding_cost",
    cost_to_income: "profitability.cost_to_income",
    non_interest_income_share: "profitability.non_interest_income_share",
    top10_obligor_share: "concentration.top10_obligor_share",
    single_obligor_pct: "concentration.single_obligor_pct",
    sector_concentration: "concentration.sector_concentration",
  };
  return map[c];
}

/**
 * Deterministic 24-month mock for "First Meridian Bank" (commercial bank, Nigeria).
 * Story: NPL breaches the 5% CBN ceiling late in the window, but the final-month spike is
 * dominated by post-forbearance reclassification (regulatory noise) while genuine new
 * defaults and Stage-2 migration rise more slowly. NIM compresses on funding cost, CAR
 * erodes toward the CBN minimum + risk add-on, term deposits gain share at stable totals,
 * and top-10 obligor concentration creeps past appetite.
 */
export function generateSeedBank(endPeriod: Period = currentPeriod(), months = 24): SeedBank {
  const periods = periodRange(endPeriod, months);
  const t = periods.map((_, i) => i); // 0..23, oldest -> newest
  const rng = mulberry32(20260317);
  const noise = (amp: number) => (rng() - 0.5) * 2 * amp;
  // Fixed ingestion timestamp derived from the end period: fully deterministic seed.
  const at = `${endPeriod}-28T05:30:00.000Z`;
  const out: AggregateRecord[] = [];
  const push = (concept: SeedConcept, values: number[], unit: string, dimensions: Record<string, string> = {}) => {
    out.push(...records(periods, concept, values, unit, dimensions, at));
  };

  // --- Asset quality ---
  // NPL: 4.1% drifting up, plus a cumulative forbearance-reclassification level step at t=21..23.
  const reclassFlow = t.map((i) => (i === 21 ? 0.5 : i === 22 ? 0.4 : i === 23 ? 0.15 : 0)); // pp contribution per month
  const reclassLevel = t.map((i) => reclassFlow.slice(0, i + 1).reduce((a: number, b: number) => a + b, 0)); // cumulative level
  const npl = t.map((i) => 4.1 + 0.045 * i + reclassLevel[i] + noise(0.04));
  push("npl_ratio", npl, "%");

  const segBase: Record<string, number> = { SME: 5.0, Retail: 3.0, Corporate: 4.4, "Oil & Gas": 6.5, Agriculture: 6.0 };
  const segSlope: Record<string, number> = { SME: 0.06, Retail: 0.035, Corporate: 0.04, "Oil & Gas": 0.05, Agriculture: 0.05 };
  for (const s of SEGMENTS) {
    const ogSpike = s === "Oil & Gas" ? reclassLevel : t.map(() => 0);
    push("npl_by_segment", t.map((i) => segBase[s] + segSlope[s] * i + ogSpike[i] + noise(0.05)), "%", { segment: s });
  }

  push("stage2_ratio", t.map((i) => 8.0 + 0.28 * i + noise(0.05)), "%");
  push("stage_migration", t.map((i) => 0.05 + 0.012 * i + noise(0.01)), "pp");
  push("reclassified_forborne", t.map((i) => reclassFlow[i] * 0.9 + noise(0.01)), "pp");
  push("new_defaults", t.map((i) => 0.04 + 0.008 * i + noise(0.008)), "pp");
  push("watchlist_growth", t.map((i) => 0.03 + 0.011 * i + noise(0.01)), "pp");
  push("cost_of_risk", t.map((i) => 2.0 + 0.028 * i + noise(0.03)), "%");
  push("provision_coverage", t.map((i) => 62 - 0.36 * i + noise(0.2)), "%");
  const cohortBase: Record<string, number> = { "2023": 5.6, "2024": 4.3, "2025": 6.9 };
  for (const c of COHORTS) {
    push("vintage_default_curves", t.map((i) => cohortBase[c] + (c === "2025" ? 0.06 * i : -0.01 * i) + noise(0.06)), "%", { cohort: c });
  }

  // --- Capital ---
  push("car", t.map((i) => 16.5 - 0.08 * i - 0.004 * i * i + noise(0.03)), "%");
  push("cet1_ratio", t.map((i) => 14.0 - 0.09 * i - 0.0025 * i * i + noise(0.03)), "%");
  push("capital_consumption_run_rate", t.map((i) => 0.45 + 0.012 * i + noise(0.02)), "pp");
  push("rwa_growth", t.map((i) => 1.5 + 0.05 * i + noise(0.05)), "%");

  // --- Liquidity & funding ---
  push("liquidity_ratio", t.map((i) => 38.5 - 0.29 * i + noise(0.1)), "%");
  push("lcr", t.map((i) => 150 - 1.45 * i + noise(0.6)), "%");
  push("crr_position", t.map((i) => 100 - 0.5 * i + noise(0.4)), "%");
  push("ldr", t.map((i) => 66 + 0.4 * i + noise(0.1)), "%");
  push("deposit_total", t.map((i) => 5200 + 3.5 * i + noise(4)), "NGN bn");
  // Deposit mix: demand shrinks, term grows; shares sum to ~100.
  const demand = t.map((i) => 52 - 0.58 * i + noise(0.15));
  const term = t.map((i) => 28 + 0.62 * i + noise(0.15));
  const savings = t.map((i, idx) => 100 - demand[idx] - term[idx]);
  push("deposit_mix", demand, "%", { deposit_type: "Demand" });
  push("deposit_mix", savings, "%", { deposit_type: "Savings" });
  push("deposit_mix", term, "%", { deposit_type: "Term" });
  push("cost_of_deposits", t.map((i) => 2.8 + 0.055 * i + noise(0.02)), "%");

  // --- Profitability ---
  push("nim", t.map((i) => 4.8 - 0.05 * i - 0.001 * i * i + noise(0.02)), "%");
  push("asset_yield", t.map((i) => 11.0 - 0.033 * i + noise(0.02)), "%");
  push("funding_cost", t.map((i) => 5.9 + 0.05 * i + 0.0012 * i * i + noise(0.02)), "%");
  push("cost_to_income", t.map((i) => 57 + 0.4 * i + noise(0.15)), "%");
  push("non_interest_income_share", t.map((i) => 24 - 0.15 * i + noise(0.1)), "%");

  // --- Concentration ---
  push("top10_obligor_share", t.map((i) => 31 + 0.2 * i + 0.02 * i * i + noise(0.1)), "%");
  push("single_obligor_pct", t.map((i) => 13.5 + 0.22 * i + noise(0.05)), "%");
  const sectorBase: Record<string, number> = { "Oil & Gas": 22, Manufacturing: 18, Trade: 16, "Real Estate": 12, Agriculture: 11, Power: 9, Other: 12 };
  for (const s of SECTORS) {
    const spike = s === "Oil & Gas" ? reclassLevel.map((v) => v * 1.2) : t.map(() => 0);
    push("sector_concentration", t.map((i) => Math.max(1, sectorBase[s] + (s === "Oil & Gas" ? 0.3 * i : 0.02 * i) + spike[i] + noise(0.08))), "%", { sector: s });
  }

  return { bankName: "First Meridian Bank (demo)", endPeriod, periods, records: out };
}
