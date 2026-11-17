import type { DetectContext, Diagnostics, EvidenceLink, Insight, Period, Rule, Severity, TriggerResult } from "../types.ts";
import { addMonths, linearSlope, uid } from "../util.ts";

export interface SeriesPoint {
  period: Period;
  value: number;
}

/** Fetch a certified-mapped aggregate series. Returns null when no certified mapping exists. */
export async function getSeries(ctx: DetectContext, concept: string, dimensions?: Record<string, string>): Promise<SeriesPoint[]> {
  return ctx.store.getSeries(concept, dimensions ?? {});
}

export function isCertified(ctx: DetectContext, concept: string): boolean {
  return ctx.mappings.some((m) => m.concept === concept && m.status === "certified" && m.measureName);
}

export function latest(s: SeriesPoint[]): SeriesPoint | undefined {
  return s[s.length - 1];
}

/** Value `months` periods before the end of the series. */
export function back(s: SeriesPoint[], months: number): SeriesPoint | undefined {
  return s[s.length - 1 - months];
}

export function delta(s: SeriesPoint[], months: number): number | null {
  const a = latest(s);
  const b = back(s, months);
  if (!a || !b) return null;
  return a.value - b.value;
}

export function sumWindow(s: SeriesPoint[], count: number, offset = 0): number {
  const end = s.length - 1 - offset;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const p = s[end - i];
    if (p) sum += p.value;
  }
  return sum;
}

export function evidence(label: string, concept: string, measure: string | null, point: SeriesPoint, unit: string, reportUrl?: string, page?: string): EvidenceLink {
  return { label, concept, measure: measure ?? concept, period: point.period, value: point.value, unit, reportUrl, page };
}

export function measureFor(ctx: DetectContext, concept: string): string | null {
  return ctx.mappings.find((m) => m.concept === concept)?.measureName ?? null;
}

/**
 * Confidence = mapping certification + data freshness.
 * Only certified mappings feed production insights; draft/unmapped concepts cap
 * confidence and are flagged in the insight payload.
 */
export function computeConfidence(ctx: DetectContext, concepts: string[], freshness: { concept: string; at: string }[]): number {
  const certifiedRatio = concepts.length === 0 ? 1 : concepts.filter((c) => isCertified(ctx, c)).length / concepts.length;
  const now = Date.now();
  const fresh = freshness.filter((f) => concepts.includes(f.concept));
  const freshnessScore =
    fresh.length === 0
      ? 0
      : fresh.filter((f) => now - Date.parse(f.at) <= 26 * 3600 * 1000).length / Math.max(1, concepts.length);
  const score = 0.35 + 0.45 * certifiedRatio + 0.2 * freshnessScore;
  return Math.min(0.98, Math.round(score * 100) / 100);
}

export async function buildInsight(params: {
  ctx: DetectContext;
  rule: Rule;
  trigger: TriggerResult;
  diagnostics: Diagnostics;
  narrative: string;
  claims: Insight["claims"];
  concepts: string[];
  freshness: { concept: string; at: string }[];
}): Promise<Insight> {
  const { ctx, rule, trigger, diagnostics, narrative, claims, concepts, freshness } = params;
  const confidence = computeConfidence(ctx, concepts, freshness);
  return {
    id: uid("ins"),
    ruleId: rule.id,
    domain: rule.domain,
    severity: trigger.severity,
    title: rule.title,
    narrative,
    claims,
    evidence: diagnostics.evidence,
    owner: diagnostics.routing.owner,
    routeTo: diagnostics.routing.routeTo,
    confidence,
    status: "new",
    createdPeriod: ctx.now,
    createdAt: new Date().toISOString(),
    reportUrl: ctx.pbi.getReportUrl(ctx.datasetId),
    diagnostics: diagnostics.charts,
  };
}

/** Run one rule end-to-end: trigger -> diagnose -> (caller narrates) */
export async function executeRule(rule: Rule, ctx: DetectContext): Promise<{ trigger: TriggerResult; diagnostics: Diagnostics } | null> {
  const trigger = await rule.trigger(ctx);
  if (!trigger) return null;
  const diagnostics = await rule.diagnose(ctx, trigger);
  return { trigger, diagnostics };
}

export function severityRank(s: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s];
}

export { addMonths, linearSlope };
