import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { delta, evidence, getSeries, latest, measureFor } from "../framework.ts";

/**
 * Rule 2 — Stage 2 leading indicator. Stage 2 ratio rises materially while cost of
 * risk lags => implied IFRS 9 ECL catch-up risk. Routes to Head of Credit Risk.
 */
export const stage2LeadingRule: Rule = {
  id: "stage2-leading",
  domain: "asset_quality",
  title: "Stage 2 build vs. lagging cost of risk",
  description: "Stage 2 ratio up materially over 6 months while cost of risk has not followed — ECL catch-up risk.",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const s2 = await getSeries(ctx, "asset_quality.stage2_ratio");
    const cor = await getSeries(ctx, "asset_quality.cost_of_risk");
    if (s2.length < 7 || cor.length < 7) return null;
    const s2Rise = delta(s2, 6);
    const corRise = delta(cor, 6);
    if (s2Rise === null || corRise === null) return null;
    if (s2Rise >= ctx.thresholds.stage2RisePp6m && corRise < ctx.thresholds.stage2CorLagPp) {
      return {
        severity: s2Rise >= ctx.thresholds.stage2RisePp6m * 2 ? "high" : "medium",
        headlineFacts: [
          { label: "Stage 2 ratio now", value: latest(s2)!.value, unit: "%", concept: "asset_quality.stage2_ratio", period: latest(s2)!.period },
          { label: "Stage 2 rise, 6m", value: Math.round(s2Rise * 100) / 100, unit: "pp", concept: "asset_quality.stage2_ratio", period: latest(s2)!.period },
          { label: "Cost of risk rise, 6m", value: Math.round(corRise * 100) / 100, unit: "pp", concept: "asset_quality.cost_of_risk", period: latest(cor)!.period },
        ],
      };
    }
    return null;
  },

  async diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-credit-risk");
    const s2 = await getSeries(ctx, "asset_quality.stage2_ratio");
    const cor = await getSeries(ctx, "asset_quality.cost_of_risk");
    const cov = await getSeries(ctx, "asset_quality.provision_coverage");
    const s2Now = latest(s2)!;
    const s2Rise = delta(s2, 6)!;
    const corRise = delta(cor, 6)!;
    const covNow = latest(cov);
    // Implied ECL catch-up: Stage 2 build not yet in P&L, scaled by uncovered share.
    const impliedCatchUpPp = covNow ? Math.round(s2Rise * (100 - covNow.value) * 10) / 1000 : null;
    const facts = [
      { label: "Stage 2 ratio", value: s2Now.value, unit: "%", concept: "asset_quality.stage2_ratio", period: s2Now.period },
      { label: "Stage 2 6m change", value: Math.round(s2Rise * 100) / 100, unit: "pp", concept: "asset_quality.stage2_ratio", period: s2Now.period },
      { label: "Cost of risk 6m change", value: Math.round(corRise * 100) / 100, unit: "pp", concept: "asset_quality.cost_of_risk", period: latest(cor)!.period },
      ...(covNow ? [{ label: "Provision coverage", value: covNow.value, unit: "%", concept: "asset_quality.provision_coverage", period: covNow.period }] : []),
    ];
    return {
      evidence: [
        evidence("Stage 2 ratio", "asset_quality.stage2_ratio", measureFor(ctx, "asset_quality.stage2_ratio"), s2Now, "%", reportUrl, "IFRS 9 Staging"),
        evidence("Cost of risk", "asset_quality.cost_of_risk", measureFor(ctx, "asset_quality.cost_of_risk"), latest(cor)!, "%", reportUrl, "Impairments"),
        ...(covNow ? [evidence("Provision coverage", "asset_quality.provision_coverage", measureFor(ctx, "asset_quality.provision_coverage"), covNow, "%", reportUrl, "Coverage")] : []),
      ],
      facts,
      charts: {
        stage2Trend: s2.map((p) => ({ period: p.period, stage2: p.value })),
        corTrend: cor.map((p) => ({ period: p.period, costOfRisk: p.value })),
        coverageTrend: cov.map((p) => ({ period: p.period, coverage: p.value })),
        impliedEclCatchUpPp: impliedCatchUpPp,
      },
      routing: { owner: "Head of Credit Risk", routeTo: ["RISK", "CRO"] },
    };
  },
};
