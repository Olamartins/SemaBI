import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { evidence, getSeries, latest, linearSlope, measureFor } from "../framework.ts";

/**
 * Rule 4 — Capital trajectory. Linear (v1) projection of CAR against the CBN minimum
 * plus the risk-based add-on, net of ECL run-rate drag and RWA growth (both embedded
 * in the recent slope and the explicit ECL drag term). Alerts when the breach horizon
 * is under the configured threshold (default 18 months). Routes to CFO.
 */
export const capitalTrajectoryRule: Rule = {
  id: "capital-trajectory",
  domain: "capital",
  title: "Capital trajectory vs. CBN minimum + add-on",
  description: "Projected CAR breach horizon under the configured capital floor (minimum + risk-based add-on).",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const car = await getSeries(ctx, "capital.car");
    const cor = await getSeries(ctx, "asset_quality.cost_of_risk");
    if (car.length < 13) return null;
    const window = car.slice(-12).map((p) => p.value);
    const slope = linearSlope(window); // pp per month, recent 12m
    const cur = latest(car)!;
    const floor = ctx.thresholds.carMinimumPct + ctx.thresholds.carRiskAddOnPct;
    const eclDragPerMonth = cor.length ? latest(cor)!.value / 12 : 0; // annualised CoR as monthly capital drag
    const netSlope = slope - eclDragPerMonth * 0.5;
    let horizon: number | null = null;
    if (netSlope < 0) {
      horizon = (cur.value - floor) / -netSlope;
    }
    if (horizon === null || horizon >= ctx.thresholds.capitalBreachHorizonMonths || horizon < 0) return null;
    return {
      severity: horizon < 6 ? "critical" : horizon < 12 ? "high" : "medium",
      headlineFacts: [
        { label: "CAR now", value: cur.value, unit: "%", concept: "capital.car", period: cur.period },
        { label: "Capital floor (min + add-on)", value: floor, unit: "%", concept: "capital.car", period: cur.period },
        { label: "Projected breach horizon", value: Math.round(horizon), unit: "months", concept: "capital.car", period: cur.period },
      ],
    };
  },

  async diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-credit-risk");
    const car = await getSeries(ctx, "capital.car");
    const cet1 = await getSeries(ctx, "capital.cet1_ratio");
    const cor = await getSeries(ctx, "asset_quality.cost_of_risk");
    const rwa = await getSeries(ctx, "capital.rwa_growth");
    const runRate = await getSeries(ctx, "capital.capital_consumption_run_rate");
    const cur = latest(car)!;
    const floor = ctx.thresholds.carMinimumPct + ctx.thresholds.carRiskAddOnPct;
    const window = car.slice(-12).map((p) => p.value);
    const slope = linearSlope(window);
    const eclDrag = latest(cor) ? latest(cor)!.value / 12 : 0;
    const netSlope = slope - eclDrag * 0.5;
    const horizon = netSlope < 0 ? (cur.value - floor) / -netSlope : Infinity;
    const projection = Array.from({ length: 25 }, (_, i) => ({
      period: `+${i}m`,
      projected: Math.round((cur.value + netSlope * i) * 100) / 100,
      floor,
    }));
    const facts = [
      { label: "CAR", value: cur.value, unit: "%", concept: "capital.car", period: cur.period },
      { label: "CAR floor incl. risk add-on", value: floor, unit: "%", concept: "capital.car", period: cur.period },
      { label: "CBN CAR minimum", value: ctx.thresholds.carMinimumPct, unit: "%", concept: "capital.car", period: cur.period },
      { label: "Risk-based add-on (CBN Mar-2026)", value: ctx.thresholds.carRiskAddOnPct, unit: "%", concept: "capital.car", period: cur.period },
      { label: "Projected breach horizon", value: Math.round(horizon), unit: "months", concept: "capital.car", period: cur.period },
      ...(latest(cet1) ? [{ label: "CET1 ratio", value: latest(cet1)!.value, unit: "%", concept: "capital.cet1_ratio", period: latest(cet1)!.period }] : []),
      ...(latest(rwa) ? [{ label: "RWA growth QoQ", value: latest(rwa)!.value, unit: "%", concept: "capital.rwa_growth", period: latest(rwa)!.period }] : []),
    ];
    return {
      evidence: [
        evidence("CAR", "capital.car", measureFor(ctx, "capital.car"), cur, "%", reportUrl, "Capital"),
        ...(latest(cet1) ? [evidence("CET1 ratio", "capital.cet1_ratio", measureFor(ctx, "capital.cet1_ratio"), latest(cet1)!, "%", reportUrl, "Capital")] : []),
        evidence("Cost of risk", "asset_quality.cost_of_risk", measureFor(ctx, "asset_quality.cost_of_risk"), latest(cor)!, "%", reportUrl, "Impairments"),
      ],
      facts,
      charts: {
        carTrend: car.map((p) => ({ period: p.period, car: p.value, floor, cet1: cet1.find((c) => c.period === p.period)?.value ?? null })),
        projection,
        rwaGrowth: rwa.map((p) => ({ period: p.period, rwaGrowth: p.value })),
        runRate: runRate.map((p) => ({ period: p.period, runRate: p.value })),
        breachHorizonMonths: Math.round(horizon),
      },
      routing: { owner: "CFO", routeTo: ["CFO", "ALCO"] },
    };
  },
};
