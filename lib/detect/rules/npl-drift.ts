import type { DetectContext, Diagnostics, Rule, TriggerResult } from "../../types.ts";
import { back, evidence, getSeries, latest, measureFor, sumWindow } from "../framework.ts";

/**
 * Rule 1 — NPL drift. Trigger: NPL > CBN threshold OR >= 1pp rise over ~90 days.
 * Diagnostics decompose the move by segment and — critically — separate
 * post-forbearance reclassification noise from genuine new defaults, plus
 * vintage curves and a seasonality (YoY) check.
 */
export const nplDriftRule: Rule = {
  id: "npl-drift",
  domain: "asset_quality",
  title: "NPL drift",
  description: "NPL ratio breached the CBN 5% prudential ceiling and/or rose >= 1pp over 90 days.",

  async trigger(ctx: DetectContext): Promise<TriggerResult | null> {
    const s = await getSeries(ctx, "asset_quality.npl_ratio");
    if (s.length < 4) return null;
    const cur = latest(s)!;
    const prev3 = back(s, 3);
    const rise90 = prev3 ? cur.value - prev3.value : null;
    const breach = cur.value > ctx.thresholds.nplDriftBreachPct;
    if (!breach && (rise90 === null || rise90 < ctx.thresholds.nplDriftRisePp90d)) return null;
    const severity = breach && rise90 !== null && rise90 >= ctx.thresholds.nplDriftRisePp90d ? "critical" : breach ? "high" : "medium";
    return {
      severity,
      headlineFacts: [
        { label: "NPL ratio now", value: cur.value, unit: "%", concept: "asset_quality.npl_ratio", period: cur.period },
        ...(rise90 !== null ? [{ label: "90-day change", value: Math.round(rise90 * 100) / 100, unit: "pp", concept: "asset_quality.npl_ratio", period: cur.period }] : []),
        { label: "CBN NPL ceiling", value: ctx.thresholds.nplThresholdPct, unit: "%", concept: "asset_quality.npl_ratio", period: cur.period },
      ],
    };
  },

  async diagnose(ctx: DetectContext, trigger: TriggerResult): Promise<Diagnostics> {
    const reportUrl = ctx.pbi.getReportUrl(ctx.datasetId, "rpt-credit-risk");
    const npl = await getSeries(ctx, "asset_quality.npl_ratio");
    const cur = latest(npl)!;
    const prev3 = back(npl, 3)!;

    // Segment decomposition.
    const segRows = await ctx.store.queryAggregates("asset_quality.npl_by_segment", {});
    const segments = [...new Set(segRows.map((r) => r.dimensions.segment))].filter(Boolean);
    const segmentDecomp = segments.map((seg) => {
      const rows = segRows.filter((r) => r.dimensions.segment === seg).sort((a, b) => a.period.localeCompare(b.period));
      const now = rows[rows.length - 1];
      const ago = rows[rows.length - 4];
      return { segment: seg, now: now?.value ?? 0, ago90d: ago?.value ?? 0, deltaPp: Math.round(((now?.value ?? 0) - (ago?.value ?? 0)) * 100) / 100 };
    });

    // Driver split: migration vs reclassification vs new defaults vs watchlist, last 90d vs prior 90d.
    const drivers = ["asset_quality.stage_migration", "asset_quality.reclassified_forborne", "asset_quality.new_defaults", "asset_quality.watchlist_growth"];
    const driverSplit = [];
    for (const c of drivers) {
      const s = await getSeries(ctx, c);
      driverSplit.push({
        driver: c.split(".").pop(),
        recent90d: Math.round(sumWindow(s, 3, 0) * 100) / 100,
        prior90d: Math.round(sumWindow(s, 3, 3) * 100) / 100,
      });
    }
    const reclassRecent = driverSplit.find((d) => d.driver === "reclassified_forborne")?.recent90d ?? 0;
    const newDefaultsRecent = driverSplit.find((d) => d.driver === "new_defaults")?.recent90d ?? 0;
    const genuineDeterioration = newDefaultsRecent + (driverSplit.find((d) => d.driver === "stage_migration")?.recent90d ?? 0);
    const reclassShare = reclassRecent + genuineDeterioration > 0 ? reclassRecent / (reclassRecent + genuineDeterioration) : 0;

    // Vintage curves (latest period by cohort).
    const vinRows = await ctx.store.queryAggregates("asset_quality.vintage_default_curves", { to: cur.period });
    const vintage = [...new Set(vinRows.map((r) => r.dimensions.cohort))].map((cohort) => {
      const rows = vinRows.filter((r) => r.dimensions.cohort === cohort && r.period === cur.period);
      return { cohort, defaultRate: rows[0]?.value ?? 0 };
    });

    // Seasonality: YoY same-month comparison.
    const yoy = back(npl, 12);
    const seasonality = yoy ? { yoyDeltaPp: Math.round((cur.value - yoy.value) * 100) / 100, sameMonthLastYear: yoy.value } : null;

    const facts = [
      { label: "NPL ratio", value: cur.value, unit: "%", concept: "asset_quality.npl_ratio", period: cur.period },
      { label: "NPL ratio 90 days ago", value: prev3.value, unit: "%", concept: "asset_quality.npl_ratio", period: prev3.period },
      { label: "90-day NPL change", value: Math.round((cur.value - prev3.value) * 100) / 100, unit: "pp", concept: "asset_quality.npl_ratio", period: cur.period },
      { label: "CBN NPL ceiling", value: ctx.thresholds.nplThresholdPct, unit: "%", concept: "asset_quality.npl_ratio", period: cur.period },
      { label: "Reclassified forborne, last 90d", value: reclassRecent, unit: "pp", concept: "asset_quality.reclassified_forborne", period: cur.period },
      { label: "New defaults, last 90d", value: newDefaultsRecent, unit: "pp", concept: "asset_quality.new_defaults", period: cur.period },
      ...(seasonality ? [{ label: "NPL same month last year", value: seasonality.sameMonthLastYear, unit: "%", concept: "asset_quality.npl_ratio", period: npl[npl.length - 13]?.period ?? cur.period }] : []),
    ];

    return {
      evidence: [
        evidence("NPL ratio", "asset_quality.npl_ratio", measureFor(ctx, "asset_quality.npl_ratio"), cur, "%", reportUrl, "NPL Overview"),
        evidence("NPL ratio 90d ago", "asset_quality.npl_ratio", measureFor(ctx, "asset_quality.npl_ratio"), prev3, "%", reportUrl, "NPL Overview"),
        evidence("Reclassified forborne (90d sum)", "asset_quality.reclassified_forborne", measureFor(ctx, "asset_quality.reclassified_forborne"), { period: cur.period, value: reclassRecent }, "pp", reportUrl, "Forbearance & Reclassification"),
        evidence("New defaults (90d sum)", "asset_quality.new_defaults", measureFor(ctx, "asset_quality.new_defaults"), { period: cur.period, value: newDefaultsRecent }, "pp", reportUrl, "Defaults"),
      ],
      facts,
      charts: {
        nplTrend: npl.map((p) => ({ period: p.period, npl: p.value, threshold: ctx.thresholds.nplThresholdPct })),
        segmentDecomp,
        driverSplit,
        vintage,
        reclassificationShareOfMove: Math.round(reclassShare * 1000) / 1000,
        seasonality,
      },
      routing: { owner: "CRO Office", routeTo: ["CRO", "RISK", "CREDIT_COMMITTEE"] },
    };
  },
};
