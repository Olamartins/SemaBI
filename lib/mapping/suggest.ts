import { ALL_CONCEPTS } from "../ontology/index.ts";
import type { OntologyConcept } from "../ontology/index.ts";
import type { SemanticModelMetadata } from "../types.ts";
import { bigramSimilarity, tokenize } from "../util.ts";

export interface Suggestion {
  measure: string;
  score: number;
  reason: string;
}

const GENERIC = new Set(["ratio", "share", "pct", "percent", "curve", "curves", "mix", "position", "growth", "level", "total", "value", "contribution", "pp", "of", "by", "loan", "loans", "deposit", "deposits", "funds", "capital", "rate", "default", "defaults", "exposure", "income", "interest", "asset", "assets", "cost"]);

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** token -> concept keys that own it (label+alias tokens, minus generic words). */
let tokenOwners: Map<string, Set<string>> | null = null;

function getTokenOwners(): Map<string, Set<string>> {
  if (tokenOwners) return tokenOwners;
  tokenOwners = new Map();
  for (const c of ALL_CONCEPTS) {
    const toks = new Set([...tokenize(c.label), ...c.aliases.flatMap((a) => tokenize(a))].filter((t) => !GENERIC.has(t)));
    for (const t of toks) {
      const s = tokenOwners.get(t) ?? new Set<string>();
      s.add(c.key);
      tokenOwners.set(t, s);
    }
  }
  return tokenOwners;
}

function tokenOverlap(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of B) if (A.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

/**
 * Fuzzy auto-suggest: ranks model measures against an ontology concept using bigram
 * similarity (spaced + compact forms) and token overlap over label/aliases/key, with
 * penalties for stock/flow mismatch, unit mismatch, dimensioned variants of aggregate
 * concepts, and tokens that belong to a different ontology concept. A human always
 * confirms before a mapping is saved.
 */
export function suggestMeasures(concept: OntologyConcept, metadata: SemanticModelMetadata): Suggestion[] {
  const candidates = [concept.label, ...concept.aliases, concept.key.replace(/[._]/g, " ")];
  const wantsRatio = /ratio|%|share|curve|mix|coverage|position|run-rate/i.test(concept.label + concept.unit);
  const owners = getTokenOwners();
  const out: Suggestion[] = [];
  for (const m of metadata.measures) {
    const name = m.name;
    const compactName = compact(name);
    let score = Math.max(
      ...candidates.map((c) => bigramSimilarity(c, name) * 0.7 + tokenOverlap(c, name) * 0.3),
      ...candidates.map((c) => bigramSimilarity(compact(c), compactName)),
    );
    let reason = "name similarity";
    if (wantsRatio && /balance|amount|ngn|volume/i.test(name) && !/ratio|%|share/i.test(name)) {
      score *= 0.25;
      reason = "penalised: stock/flow mismatch (concept is a ratio/share)";
    }
    if (concept.unit === "%" && !/%|ratio|share|coverage|position|mix|curve/i.test(name)) {
      score *= 0.5;
      reason = "penalised: unit mismatch (concept is a percentage)";
    }
    if (concept.requiredDimensions.length === 0 && /\bby\b/i.test(name)) {
      score *= 0.55;
      reason = "penalised: dimensioned variant of an aggregate concept";
    }
    // The concept's own phrasing (or distinctive tokens) must appear in the measure
    // (compact containment), otherwise unrelated measures can outrank the right one.
    const candidateCompacts = candidates.map((c) => compact(c)).filter((c) => c.length >= 4);
    const distinctiveTokens = [...new Set([...tokenize(concept.label), ...concept.aliases.flatMap((a) => tokenize(a))].filter((t) => !GENERIC.has(t)))].map((t) => compact(t)).filter((t) => t.length >= 3);
    const ownHit =
      candidateCompacts.some((c) => compactName.includes(c)) ||
      distinctiveTokens.some((t) => compactName.includes(t)) ||
      candidates.some((c) => tokenOverlap(c, name) >= 0.6);
    if (candidateCompacts.length + distinctiveTokens.length > 0 && !ownHit) {
      score *= 0.2;
      reason = "penalised: none of the concept's distinctive tokens present";
    }
    // Penalise measures whose distinctive tokens belong to another ontology concept
    // (e.g. "Stage Migration ..." suggested for the Stage 2 ratio concept).
    const nameTokens = tokenize(name);
    const foreign = nameTokens.filter((t) => {
      const o = owners.get(t);
      return o !== undefined && o.size === 1 && !o.has(concept.key);
    });
    if (foreign.length > 0) {
      score *= 0.35;
      reason = `penalised: tokens belong to other concepts (${foreign.slice(0, 2).join(", ")})`;
    }
    if (score > 0.08) out.push({ measure: name, score: Math.round(score * 1000) / 1000, reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
