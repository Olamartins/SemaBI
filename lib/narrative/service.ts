import { readFileSync, existsSync } from "node:fs";
import type { NumericClaim, Period } from "../types.ts";
import type { Repository } from "../store/repository.ts";
import { createProvider } from "./provider.ts";
import type { LlmProvider } from "./provider.ts";
import { validateNarrative } from "./validator.ts";
import type { Fact } from "./validator.ts";
export interface NarrativeInput {
  ruleId: string;
  title: string;
  severity: string;
  domain: string;
  facts: { label: string; value: number; unit: string; concept: string; period: Period }[];
  routing: { owner: string; routeTo: string[] };
  thresholds: Record<string, number>;
}

export interface NarrativeResult {
  narrative: string;
  claims: NumericClaim[];
  provider: string;
  removedSentences: string[];
}

const PROMPT_DIR = `${process.cwd()}/prompts/narrative`;

function loadPrompt(name: string, fallback: string): string {
  const p = `${PROMPT_DIR}/${name}`;
  if (existsSync(p)) return readFileSync(p, "utf8");
  return fallback;
}

const SYSTEM_FALLBACK = "You are SemaBI. Use only the supplied certified facts; cite measure and period for every number.";
const USER_FALLBACK = "Rule: {{ruleId}} — {{title}}\nFACTS:\n{{facts}}\nThresholds: {{thresholds}}\nRouting: {{routing}}";

export function buildPrompts(input: NarrativeInput): { system: string; user: string } {
  const system = loadPrompt("system.v1.md", SYSTEM_FALLBACK);
  const userTpl = loadPrompt("insight.v1.md", USER_FALLBACK);
  const facts = input.facts.map((f) => `- ${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""} (${f.period})`).join("\n");
  const thresholds = Object.entries(input.thresholds).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const user = userTpl
    .replace("{{ruleId}}", input.ruleId)
    .replace("{{title}}", input.title)
    .replace("{{domain}}", input.domain)
    .replace("{{severity}}", input.severity)
    .replace("{{routing}}", `${input.routing.owner} -> ${input.routing.routeTo.join(", ")}`)
    .replace("{{facts}}", facts)
    .replace(/\{\{(\w+)\}\}/g, (_, k) => String((input.thresholds as Record<string, unknown>)[k] ?? ""));
  return { system, user };
}

/**
 * Narrate an insight: LLM (grounded in facts only) with template fallback, then
 * validate every numeric claim against the aggregate store before publishing.
 */
export async function narrate(input: NarrativeInput, opts: { store: Repository; provider?: LlmProvider }): Promise<NarrativeResult> {
  const provider = opts.provider ?? createProvider();
  const { system, user } = buildPrompts(input);
  let raw: string;
  let usedProvider = provider.name;
  try {
    raw = await provider.generate(system, user);
  } catch (err) {
    // LLM failure degrades to template narratives — never block the digest.
    const { TemplateProvider } = await import("./template.ts");
    const fallback = new TemplateProvider();
    raw = await fallback.generate(system, user);
    usedProvider = `template(fallback:${provider.name}-error)`;
    console.warn(`[narrative] provider ${provider.name} failed, using template fallback:`, (err as Error).message);
  }
  const validation = await validateNarrative(raw, input.facts as Fact[], opts.store);
  return { narrative: validation.narrative, claims: validation.claims, provider: usedProvider, removedSentences: validation.removedSentences };
}
