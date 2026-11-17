import { conceptByKey } from "../ontology/index.ts";
import type { OntologyConcept } from "../ontology/index.ts";
import type { Mapping, SemanticModelMetadata } from "../types.ts";
export interface GapReport {
  concept: string;
  label: string;
  status: "mapped" | "gap";
  measureName: string | null;
  suggestedDax: string | null;
  note: string;
}

/** For unmapped concepts, render concrete DAX the bank can paste into their model. */
export function gapRemediation(conceptKey: string, metadata: SemanticModelMetadata, mapping: Mapping | null): GapReport {
  const concept = conceptByKey(conceptKey);
  if (!concept) throw new Error(`Unknown ontology concept ${conceptKey}`);
  if (mapping?.measureName) {
    return { concept: conceptKey, label: concept.label, status: "mapped", measureName: mapping.measureName, suggestedDax: null, note: `Mapped to certified measure '${mapping.measureName}'` };
  }
  const exists = metadata.measures.some((m) => m.name.toLowerCase().includes(concept.label.toLowerCase()));
  return {
    concept: conceptKey,
    label: concept.label,
    status: "gap",
    measureName: null,
    suggestedDax: concept.daxGapTemplate,
    note: exists
      ? "A similar measure name exists but was not confirmed — review before creating a duplicate."
      : "No suitable measure found in the semantic model. Create this measure, then map it.",
  };
}

export function coverage(mappings: Mapping[], allConcepts: OntologyConcept[]): { total: number; certified: number; draft: number; unmapped: number; pct: number } {
  const certified = mappings.filter((m) => m.status === "certified" && m.measureName).length;
  const draft = mappings.filter((m) => m.status === "draft").length;
  const unmapped = allConcepts.length - mappings.filter((m) => m.measureName).length;
  const total = allConcepts.length;
  return { total, certified, draft, unmapped, pct: total === 0 ? 0 : Math.round((certified / total) * 100) };
}
