import { ALL_CONCEPTS, conceptByKey } from "../ontology/index.ts";
import type { OntologyConcept } from "../ontology/index.ts";
import type { Mapping, SemanticModelMetadata } from "../types.ts";
import type { Repository } from "../store/repository.ts";
import { suggestMeasures } from "./suggest.ts";

/** Initialise draft mappings for every ontology concept using auto-suggest (human confirms). */
export async function initMappings(store: Repository, metadata: SemanticModelMetadata): Promise<Mapping[]> {
  const existing = await store.getMappings();
  const existingKeys = new Set(existing.map((m) => m.concept));
  const now = new Date().toISOString();
  const out: Mapping[] = [...existing];
  for (const concept of ALL_CONCEPTS) {
    if (existingKeys.has(concept.key)) continue;
    const suggestions = suggestMeasures(concept, metadata);
    const top = suggestions[0];
    const mapping: Mapping = {
      concept: concept.key,
      status: "draft",
      measureName: top && top.score >= 0.35 ? top.measure : null,
      daxExpression: top && top.score >= 0.35 ? null : concept.daxGapTemplate,
      dimensions: defaultDimensions(concept),
      autoSuggested: Boolean(top && top.score >= 0.35),
      updatedAt: now,
    };
    await store.saveMapping(mapping);
    out.push(mapping);
  }
  return out;
}

function defaultDimensions(concept: OntologyConcept): Record<string, string> {
  const map: Record<string, string> = {
    segment: "Loans[Segment]",
    sector: "Obligors[Sector]",
    cohort: "Loans[Cohort]",
    deposit_type: "Deposits[Deposit Type]",
    from_stage: "Loans[Prev Stage]",
    to_stage: "Loans[IFRS9 Stage]",
  };
  const dims: Record<string, string> = {};
  for (const d of concept.requiredDimensions) dims[d] = map[d] ?? `${d}[${d}]`;
  return dims;
}

export async function certifyMapping(store: Repository, concept: string, by: string): Promise<Mapping> {
  const m = await store.getMapping(concept);
  if (!m) throw new Error(`No mapping for ${concept}`);
  if (!m.measureName) throw new Error(`Cannot certify ${concept}: no measure mapped (gap open)`);
  const updated: Mapping = { ...m, status: "certified", certifiedBy: by, certifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await store.saveMapping(updated);
  return updated;
}

export async function setMapping(store: Repository, concept: string, patch: Partial<Mapping>): Promise<Mapping> {
  const cur = (await store.getMapping(concept)) ?? {
    concept,
    status: "draft" as const,
    measureName: null,
    daxExpression: conceptByKey(concept)?.daxGapTemplate ?? null,
    dimensions: defaultDimensions(conceptByKey(concept)!),
    autoSuggested: false,
    updatedAt: new Date().toISOString(),
  };
  const next: Mapping = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await store.saveMapping(next);
  return next;
}
