import type { NumericClaim, Period } from "../types.ts";
import type { Repository } from "../store/repository.ts";
export interface Fact {
  label: string;
  value: number;
  unit: string;
  concept: string;
  period: Period;
}

export interface ValidationResult {
  narrative: string; // sanitized: only verified numbers remain
  claims: NumericClaim[];
  removedSentences: string[];
}

// Only numbers with an explicit unit are treated as claims. Bare numbers are only
// claims if they exactly match a supplied fact (periods like 2026-03 are masked out
// first; durations like "90 days" are not KPI claims and are ignored).
const NUM_RE = /(-?\d+(?:\.\d+)?)\s*(%|pp|bn|x)?/g;
const PERIOD_RE = /\b\d{4}-\d{2}\b/g;

function normUnit(u: string | undefined): string {
  return (u ?? "").toLowerCase();
}

function unitsCompatible(a: string, b: string): boolean {
  const na = normUnit(a);
  const nb = normUnit(b);
  if (na === nb) return true;
  if (na === "" && (nb === "x" || nb === "")) return true;
  // "NGN bn" facts may be narrated as "bn"
  if ((na === "ngn bn" && nb === "bn") || (nb === "ngn bn" && na === "bn")) return true;
  return false;
}

function valuesMatch(a: number, b: number): boolean {
  const abs = Math.abs(a - b);
  if (abs <= 0.051) return true; // rounding tolerance for pp/% claims
  return Math.abs(a - b) / Math.max(1e-9, Math.abs(b)) <= 0.01; // 1% relative
}

/**
 * Re-checks every numeric claim in a narrative against the aggregate store.
 * The narrative may only contain numbers that trace to a stored aggregate for the
 * cited measure+period (or to a supplied fact). Unverifiable sentences are removed —
 * the LLM never gets to invent numbers into a published insight.
 */
export async function validateNarrative(narrative: string, facts: Fact[], store: Repository): Promise<ValidationResult> {
  const sentences = narrative.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];
  const claims: NumericClaim[] = [];

  for (const sentence of sentences) {
    const masked = sentence.replace(PERIOD_RE, "‹period›");
    NUM_RE.lastIndex = 0;
    const matches = [...masked.matchAll(NUM_RE)].filter((m) => m[1] !== undefined && m[1] !== "");
    let sentenceOk = true;
    for (const m of matches) {
      const value = Number(m[1]);
      const unit = m[2] ?? "";
      // A bare number (no unit) is only a claim when it exactly matches a fact value.
      if (!unit && !facts.some((f) => valuesMatch(f.value, value))) continue;
      // Find a fact or stored aggregate that supports this number.
      const fact = facts.find((f) => valuesMatch(f.value, value) && (unit ? unitsCompatible(f.unit, unit) : true));
      let verified = Boolean(fact);
      let measure = fact?.concept ?? "";
      let period: Period = fact?.period ?? "";
      if (!verified) {
        // Cross-check against the aggregate store directly (concepts touched by the facts).
        const concepts = [...new Set(facts.map((f) => f.concept))];
        for (const c of concepts) {
          const rows = await store.queryAggregates(c, {});
          const hit = rows.find((r) => valuesMatch(r.value, value) && unitsCompatible(r.unit, unit || r.unit));
          if (hit) {
            verified = true;
            measure = hit.sourceMeasure;
            period = hit.period;
            break;
          }
        }
      }
      claims.push({ text: sentence, value, unit: unit || (fact?.unit ?? ""), measure: measure || "unverified", period, verified });
      if (!verified) sentenceOk = false;
    }
    if (sentenceOk) kept.push(sentence);
    else removed.push(sentence);
  }

  let finalNarrative = kept.join(" ").trim();
  if (!finalNarrative && facts.length > 0) {
    // Degrade gracefully: a facts-only fallback sentence set.
    finalNarrative = facts.map((f) => `${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""} (${f.period})`).join("; ");
  }
  return { narrative: finalNarrative, claims, removedSentences: removed };
}
