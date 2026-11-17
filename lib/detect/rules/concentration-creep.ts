import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { delta, evidence, getSeries, latest, measureFor } from "../framework.ts";

/**
 * Rule 6 — Concentration creep (slow burn). Top-10 obligor share trend over 90 days vs
 * appetite, plus single-obligor approach-to-limit alerts (not only breaches).
 * Routes to the Credit Risk Committee.
 */
export const concentrationCreepRule: Rule = {
  id: "concentration-creep",
  domain: "concentration",
  title: "Concentration creep / single-obligor approach to limit",
  description: "Top-10 share rising toward appetite and/or largest obligor approaching the 20% single-obligor limit.",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const top10 = await getSeries(ctx, "concentration.top10_obligor_share");
    const single = await getSeries(ctx, "concentration.single_obligor_pct");
    if (top10.length < 4 || single.length < 1) return null;
    const rise90 = delta(top10, 3);
    const now = latest(top10)!;
    const singleNow = latest(single)!;
    const appetiteBreach = now.value > ctx.thresholds.top10ObligorAppetitePct;
    const creep = rise90 !== null && rise90 >= ctx.thresholds.concentrationTop10RisePp90d;
    const approach = singleNow.value >= (ctx.thresholds.singleObligorApproachPctOfLimit / 100) * ctx.thresholds.singleObligorLimitPctOfFunds;
    const breach = singleNow.value > ctx.thresholds.singleObligorLimitPctOfFunds;
    if (!creep && !appetiteBreach && !approach && !breach) return null;
    const severity = breach ? "critical" : approach ? "high" : "medium";
    return {
      severity,
      headlineFacts: [
        { label: "Top-10 obligor share", value: now.value, unit: "%", concept: "concentration.top10_obligor_share", period: now.period },
        ...(rise90 !== null ? [{ label: "Top-10 change, 90d", value: Math.round(rise90 * 100) / 100, unit: "pp", concept: "concentration.top10_obligor_share", period: now.period }] : []),
        { label: "Single obligor % of funds", value: singleNow.value, unit: "%", concept: "concentration.single_obligor_pct", period: singleNow.period },
        { label: "Single-obligor limit", value: ctx.thresholds.singleObligorLimitPctOfFunds, unit: "%", concept: "concentration.single_obligor_pct", period: singleNow.period },
      ],
    };
  },

  async diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-credit-risk");
    const top10 = await getSeries(ctx, "concentration.top10_obligor_share");
    const single = await getSeries(ctx, "concentration.single_obligor_pct");
    const sectorRows = await ctx.store.queryAggregates("concentration.sector_concentration", {});
    const sectors = [...new Set(sectorRows.map((r) => r.dimensions.sector))].filter(Boolean);
    const sectorConc = sectors.map((s) => {
      const rows = sectorRows.filter((r) => r.dimensions.sector === s).sort((a, b) => a.period.localeCompare(b.period));
      const now = rows[rows.length - 1];
      return { sector: s, now: now?.value ?? 0 };
    }).sort((a, b) => b.now - a.now);
    const now = latest(top10)!;
    const singleNow = latest(single)!;
    const headroomPp = Math.round((ctx.thresholds.singleObligorLimitPctOfFunds - singleNow.value) * 100) / 100;
    const facts = [
      { label: "Top-10 obligor share", value: now.value, unit: "%", concept: "concentration.top10_obligor_share", period: now.period },
      { label: "Top-10 appetite", value: ctx.thresholds.top10ObligorAppetitePct, unit: "%", concept: "concentration.top10_obligor_share", period: now.period },
      { label: "Top-10 90d change", value: delta(top10, 3) ?? 0, unit: "pp", concept: "concentration.top10_obligor_share", period: now.period },
      { label: "Single obligor % of funds", value: singleNow.value, unit: "%", concept: "concentration.single_obligor_pct", period: singleNow.period },
      { label: "Single-obligor limit (CBN)", value: ctx.thresholds.singleObligorLimitPctOfFunds, unit: "%", concept: "concentration.single_obligor_pct", period: singleNow.period },
      { label: "Headroom to limit", value: headroomPp, unit: "pp", concept: "concentration.single_obligor_pct", period: singleNow.period },
    ];
    return {
      evidence: [
        evidence("Top-10 obligor share", "concentration.top10_obligor_share", measureFor(ctx, "concentration.top10_obligor_share"), now, "%", reportUrl, "Concentration"),
        evidence("Single obligor % of funds", "concentration.single_obligor_pct", measureFor(ctx, "concentration.single_obligor_pct"), singleNow, "%", reportUrl, "Single Obligor"),
      ],
      facts,
      charts: {
        top10Trend: top10.map((p) => ({ period: p.period, top10: p.value, appetite: ctx.thresholds.top10ObligorAppetitePct })),
        singleObligorTrend: single.map((p) => ({ period: p.period, singleObligor: p.value, limit: ctx.thresholds.singleObligorLimitPctOfFunds, approachLine: (ctx.thresholds.singleObligorApproachPctOfLimit / 100) * ctx.thresholds.singleObligorLimitPctOfFunds })),
        sectorConcentration: sectorConc,
        headroomPp,
      },
      routing: { owner: "Credit Risk Committee", routeTo: ["CREDIT_COMMITTEE", "CRO"] },
    };
  },
};
