import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { delta, evidence, getSeries, latest, measureFor } from "../framework.ts";

/**
 * Rule 5 — Funding erosion. Structural deposit-mix shift (toward term) with stable
 * totals: classify as earnings risk vs solvency risk using the liquidity ratio.
 * Routes to ALCO.
 */
export const fundingErosionRule: Rule = {
  id: "funding-erosion",
  domain: "liquidity",
  title: "Funding mix erosion (stable totals)",
  description: "Term deposits gaining share while total deposits are flat — earnings risk, or solvency risk if liquidity ratio is tight.",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const total = await getSeries(ctx, ctx.thresholds.depositTotalConcept);
    const termRows = await ctx.store.queryAggregates("liquidity.deposit_mix", { dimensions: { deposit_type: "Term" } });
    const term = termRows.sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ period: r.period, value: r.value }));
    if (total.length < 13 || term.length < 13) return null;
    const totalDriftPct = (delta(total, 12) ?? 0) / Math.max(1e-9, back12(total) ?? 1) * 100;
    const termShift = delta(term, 12) ?? 0;
    const stable = Math.abs(totalDriftPct) <= ctx.thresholds.fundingTotalDriftPct;
    if (!stable || termShift < ctx.thresholds.fundingTermShiftPp12m) return null;
    const liq = await getSeries(ctx, "liquidity.liquidity_ratio");
    const liqNow = latest(liq)?.value ?? 100;
    const solvency = liqNow < ctx.thresholds.liquidityRatioMinimumPct + 5;
    return {
      severity: solvency ? "high" : "medium",
      headlineFacts: [
        { label: "Term deposit share now", value: latest(term)!.value, unit: "%", concept: "liquidity.deposit_mix", period: latest(term)!.period },
        { label: "Term share change, 12m", value: Math.round(termShift * 100) / 100, unit: "pp", concept: "liquidity.deposit_mix", period: latest(term)!.period },
        { label: "Total deposits change, 12m", value: Math.round(totalDriftPct * 100) / 100, unit: "%", concept: ctx.thresholds.depositTotalConcept, period: latest(total)!.period },
      ],
    };
  },

  async diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-alco");
    const total = await getSeries(ctx, ctx.thresholds.depositTotalConcept);
    const mix = await ctx.store.queryAggregates("liquidity.deposit_mix", {});
    const liq = await getSeries(ctx, "liquidity.liquidity_ratio");
    const lcr = await getSeries(ctx, "liquidity.lcr");
    const cod = await getSeries(ctx, "liquidity.cost_of_deposits");
    const types = [...new Set(mix.map((r) => r.dimensions.deposit_type))].filter(Boolean);
    const mixTrend = types.map((t) => ({
      type: t,
      series: mix.filter((r) => r.dimensions.deposit_type === t).sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ period: r.period, share: r.value })),
    }));
    const term = mix.filter((r) => r.dimensions.deposit_type === "Term").sort((a, b) => a.period.localeCompare(b.period));
    const termNow = term[term.length - 1];
    const liqNow = latest(liq)!;
    const solvencyRisk = liqNow.value < ctx.thresholds.liquidityRatioMinimumPct + 5;
    const facts = [
      { label: "Total deposits", value: latest(total)!.value, unit: "NGN bn", concept: ctx.thresholds.depositTotalConcept, period: latest(total)!.period },
      { label: "Term share", value: termNow.value, unit: "%", concept: "liquidity.deposit_mix", period: termNow.period },
      { label: "Term share 12m change", value: delta(term.map((r) => ({ period: r.period, value: r.value })), 12)!, unit: "pp", concept: "liquidity.deposit_mix", period: termNow.period },
      { label: "Liquidity ratio", value: liqNow.value, unit: "%", concept: "liquidity.liquidity_ratio", period: liqNow.period },
      { label: "CBN liquidity minimum", value: ctx.thresholds.liquidityRatioMinimumPct, unit: "%", concept: "liquidity.liquidity_ratio", period: liqNow.period },
      { label: "Cost of deposits", value: latest(cod)!.value, unit: "%", concept: "liquidity.cost_of_deposits", period: latest(cod)!.period },
    ];
    return {
      evidence: [
        evidence("Total deposits", ctx.thresholds.depositTotalConcept, measureFor(ctx, ctx.thresholds.depositTotalConcept), latest(total)!, "NGN bn", reportUrl, "Funding"),
        evidence("Term deposit share", "liquidity.deposit_mix", measureFor(ctx, "liquidity.deposit_mix"), termNow, "%", reportUrl, "Deposit Mix"),
        evidence("Liquidity ratio", "liquidity.liquidity_ratio", measureFor(ctx, "liquidity.liquidity_ratio"), liqNow, "%", reportUrl, "Liquidity"),
        evidence("LCR", "liquidity.lcr", measureFor(ctx, "liquidity.lcr"), latest(lcr)!, "%", reportUrl, "Liquidity"),
      ],
      facts,
      charts: {
        depositTotal: total.map((p) => ({ period: p.period, total: p.value })),
        depositMixTrend: mixTrend,
        liquidityTrend: liq.map((p) => ({ period: p.period, liquidityRatio: p.value, minimum: ctx.thresholds.liquidityRatioMinimumPct })),
        lcrTrend: lcr.map((p) => ({ period: p.period, lcr: p.value, minimum: ctx.thresholds.lcrMinimumPct })),
        classification: solvencyRisk ? "solvency risk" : "earnings risk",
      },
      routing: { owner: "ALCO / Treasury", routeTo: ["ALCO"] },
    };
  },
};

function back12(s: { period: string; value: number }[]): number | undefined {
  return s[s.length - 13]?.value;
}
