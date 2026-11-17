import type { DetectContext, Insight, Rule } from "../types.ts";
import { buildInsight, executeRule } from "./framework.ts";
import { nplDriftRule } from "./rules/npl-drift.ts";
import { stage2LeadingRule } from "./rules/stage2-leading.ts";
import { nimCompressionRule } from "./rules/nim-compression.ts";
import { capitalTrajectoryRule } from "./rules/capital-trajectory.ts";
import { fundingErosionRule } from "./rules/funding-erosion.ts";
import { concentrationCreepRule } from "./rules/concentration-creep.ts";
import { narrate } from "../narrative/service.ts";
import type { NarrativeInput } from "../narrative/service.ts";
export const RULES: Rule[] = [
  nplDriftRule,
  stage2LeadingRule,
  nimCompressionRule,
  capitalTrajectoryRule,
  fundingErosionRule,
  concentrationCreepRule,
];

/** Concepts each rule reads — used for confidence scoring. */
const RULE_CONCEPTS: Record<string, string[]> = {
  "npl-drift": ["asset_quality.npl_ratio", "asset_quality.npl_by_segment", "asset_quality.reclassified_forborne", "asset_quality.new_defaults", "asset_quality.stage_migration", "asset_quality.watchlist_growth", "asset_quality.vintage_default_curves"],
  "stage2-leading": ["asset_quality.stage2_ratio", "asset_quality.cost_of_risk", "asset_quality.provision_coverage"],
  "nim-compression": ["profitability.nim", "profitability.asset_yield", "profitability.funding_cost", "liquidity.deposit_mix", "liquidity.cost_of_deposits"],
  "capital-trajectory": ["capital.car", "capital.cet1_ratio", "capital.rwa_growth", "asset_quality.cost_of_risk"],
  "funding-erosion": ["liquidity.deposit_total", "liquidity.deposit_mix", "liquidity.liquidity_ratio", "liquidity.lcr", "liquidity.cost_of_deposits"],
  "concentration-creep": ["concentration.top10_obligor_share", "concentration.single_obligor_pct", "concentration.sector_concentration"],
};

export interface DetectRunResult {
  insights: Insight[];
  skipped: { ruleId: string; reason: string }[];
}

/**
 * Run all detectors. Idempotent: an open insight for the same rule in the same period
 * is not duplicated. LLM failure degrades to template narratives inside `narrate`.
 */
export async function runDetectors(ctx: DetectContext): Promise<DetectRunResult> {
  const freshness = await ctx.store.getFreshness();
  const existing = await ctx.store.listInsights({ status: "new" });
  const openKeys = new Set(existing.map((i) => `${i.ruleId}@${i.createdPeriod}`));
  const out: Insight[] = [];
  const skipped: DetectRunResult["skipped"] = [];
  for (const rule of RULES) {
    const key = `${rule.id}@${ctx.now}`;
    if (openKeys.has(key)) {
      skipped.push({ ruleId: rule.id, reason: "open insight already exists for this period (idempotent skip)" });
      continue;
    }
    const executed = await executeRule(rule, ctx);
    if (!executed) {
      skipped.push({ ruleId: rule.id, reason: "trigger conditions not met" });
      continue;
    }
    const { trigger, diagnostics } = executed;
    const input: NarrativeInput = {
      ruleId: rule.id,
      title: rule.title,
      severity: trigger.severity,
      domain: rule.domain,
      facts: diagnostics.facts,
      routing: diagnostics.routing,
      thresholds: {
        nplThresholdPct: ctx.thresholds.nplThresholdPct,
        carFloorPct: ctx.thresholds.carMinimumPct + ctx.thresholds.carRiskAddOnPct,
        liquidityMinimumPct: ctx.thresholds.liquidityRatioMinimumPct,
        singleObligorLimitPct: ctx.thresholds.singleObligorLimitPctOfFunds,
      },
    };
    const narrative = await narrate(input, { store: ctx.store });
    const insight = await buildInsight({
      ctx,
      rule,
      trigger,
      diagnostics,
      narrative: narrative.narrative,
      claims: narrative.claims,
      concepts: RULE_CONCEPTS[rule.id] ?? [],
      freshness,
    });
    await ctx.store.saveInsight(insight);
    await ctx.audit("insight.publish", {
      insightId: insight.id,
      ruleId: rule.id,
      severity: insight.severity,
      confidence: insight.confidence,
      claims: insight.claims.length,
      verifiedClaims: insight.claims.filter((c) => c.verified).length,
      provider: narrative.provider,
      routeTo: insight.routeTo,
    });
    out.push(insight);
  }
  return { insights: out, skipped };
}
