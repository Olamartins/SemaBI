import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { delta, evidence, getSeries, latest, measureFor } from "../framework.ts";

/**
 * Rule 3 — NIM compression. Decompose asset yield vs funding cost; link to deposit-mix
 * shift and repricing. Routes to Treasury / ALCO.
 */
export const nimCompressionRule: Rule = {
  id: "nim-compression",
  domain: "profitability",
  title: "NIM compression",
  description: "Net interest margin down materially over 6 months; decomposed into asset-yield vs funding-cost drivers.",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const nim = await getSeries(ctx, "profitability.nim");
    if (nim.length < 7) return null;
    const fall = delta(nim, 6);
    if (fall === null || -fall < ctx.thresholds.nimCompressionPp6m) return null;
    return {
      severity: -fall >= ctx.thresholds.nimCompressionPp6m * 2 ? "high" : "medium",
      headlineFacts: [
        { label: "NIM now", value: latest(nim)!.value, unit: "%", concept: "profitability.nim", period: latest(nim)!.period },
        { label: "NIM change, 6m", value: Math.round(fall * 100) / 100, unit: "pp", concept: "profitability.nim", period: latest(nim)!.period },
      ],
    };
  },

  async diagnose(ctx: DetectContext): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-alco");
    const nim = await getSeries(ctx, "profitability.nim");
    const ay = await getSeries(ctx, "profitability.asset_yield");
    const fc = await getSeries(ctx, "profitability.funding_cost");
    const cod = await getSeries(ctx, "liquidity.cost_of_deposits");
    const mix = await ctx.store.queryAggregates("liquidity.deposit_mix", {});
    const types = [...new Set(mix.map((r) => r.dimensions.deposit_type))].filter(Boolean);
    const term = mix.filter((r) => r.dimensions.deposit_type === "Term").sort((a, b) => a.period.localeCompare(b.period));
    const termNow = term[term.length - 1];
    const term12 = term[term.length - 13];
    const termShift = termNow && term12 ? Math.round((termNow.value - term12.value) * 100) / 100 : null;
    const mixTrend = types.map((t) => ({
      type: t,
      series: mix.filter((r) => r.dimensions.deposit_type === t).sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ period: r.period, share: r.value })),
    }));
    const ayDelta = delta(ay, 6);
    const fcDelta = delta(fc, 6);
    const nimNow = latest(nim)!;
    const facts = [
      { label: "NIM", value: nimNow.value, unit: "%", concept: "profitability.nim", period: nimNow.period },
      { label: "NIM 6m change", value: delta(nim, 6)!, unit: "pp", concept: "profitability.nim", period: nimNow.period },
      { label: "Asset yield 6m change", value: ayDelta ?? 0, unit: "pp", concept: "profitability.asset_yield", period: latest(ay)!.period },
      { label: "Funding cost 6m change", value: fcDelta ?? 0, unit: "pp", concept: "profitability.funding_cost", period: latest(fc)!.period },
      ...(termShift !== null ? [{ label: "Term deposit share 12m change", value: termShift, unit: "pp", concept: "liquidity.deposit_mix", period: termNow!.period }] : []),
    ];
    return {
      evidence: [
        evidence("NIM", "profitability.nim", measureFor(ctx, "profitability.nim"), nimNow, "%", reportUrl, "Margin"),
        evidence("Asset yield", "profitability.asset_yield", measureFor(ctx, "profitability.asset_yield"), latest(ay)!, "%", reportUrl, "Yield"),
        evidence("Funding cost", "profitability.funding_cost", measureFor(ctx, "profitability.funding_cost"), latest(fc)!, "%", reportUrl, "Funding"),
        evidence("Cost of deposits", "liquidity.cost_of_deposits", measureFor(ctx, "liquidity.cost_of_deposits"), latest(cod)!, "%", reportUrl, "Deposit Cost"),
      ],
      facts,
      charts: {
        nimTrend: nim.map((p) => ({ period: p.period, nim: p.value })),
        yieldVsFunding: nim.map((_, i) => ({ period: nim[i].period, assetYield: ay[i]?.value ?? null, fundingCost: fc[i]?.value ?? null })),
        depositMixTrend: mixTrend,
        fundingCostDelta6m: fcDelta,
        assetYieldDelta6m: ayDelta,
      },
      routing: { owner: "Treasury / ALCO", routeTo: ["ALCO", "CFO"] },
    };
  },
};
