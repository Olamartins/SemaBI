import { readFileSync, existsSync } from "node:fs";
import type { RuleParameters } from "../types.ts";
const DEFAULT_PATH = `${process.cwd()}/config/rules.default.json`;

/**
 * Regulatory reference data and detector parameters are configuration, not code.
 * Load order: SEMABI_RULES_CONFIG file (per-tenant override) -> config/rules.default.json.
 */
export function loadRuleParameters(configPath?: string): RuleParameters {
  const envPath = process.env.SEMABI_RULES_CONFIG;
  const path = configPath ?? envPath ?? (existsSync(DEFAULT_PATH) ? DEFAULT_PATH : undefined);
  if (!path) throw new Error("No rule parameter config found (set SEMABI_RULES_CONFIG)");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<RuleParameters>;
  const base = JSON.parse(readFileSync(DEFAULT_PATH, "utf8")) as RuleParameters;
  const merged = { ...base, ...raw };
  validate(merged);
  return merged;
}

export function validate(p: RuleParameters): void {
  const required: (keyof RuleParameters)[] = [
    "nplThresholdPct",
    "carMinimumPct",
    "cet1MinimumPct",
    "liquidityRatioMinimumPct",
    "lcrMinimumPct",
    "singleObligorLimitPctOfFunds",
    "nplDriftRisePp90d",
    "capitalBreachHorizonMonths",
  ];
  for (const k of required) {
    if (typeof p[k] !== "number" || Number.isNaN(p[k] as number)) {
      throw new Error(`Rule parameter ${String(k)} missing or not a number`);
    }
  }
  if (p.carMinimumPct >= p.cet1MinimumPct + p.carRiskAddOnPct && p.carRiskAddOnPct > 0) {
    // not an error, but flag inconsistent capital stack early
  }
  if (p.singleObligorLimitPctOfFunds <= 0) throw new Error("singleObligorLimitPctOfFunds must be positive");
}
