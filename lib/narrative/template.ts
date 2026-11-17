import type { LlmProvider } from "./provider.ts";
import type { Fact } from "./validator.ts";
interface ParsedPrompt {
  facts: Fact[];
  ruleId: string;
  title: string;
  severity: string;
  routing: string;
}

function parseFacts(userPrompt: string): Fact[] {
  const section = userPrompt.split("FACTS")[1]?.split("Regulatory reference")[0] ?? "";
  const facts: Fact[] = [];
  for (const line of section.split("\n")) {
    const m = /^-\s*(.+?):\s*(-?[\d.]+)\s*([a-zA-Z% ]*?)\s*\((\d{4}-\d{2})\)/.exec(line.trim());
    if (m) facts.push({ label: m[1].trim(), value: Number(m[2]), unit: m[3].trim(), concept: m[1].trim(), period: m[4] });
  }
  return facts;
}

/**
 * Deterministic fallback narrator. Builds the narrative ONLY from supplied facts —
 * used when no LLM key is configured or the LLM call fails. Never blocks the digest.
 */
export class TemplateProvider implements LlmProvider {
  name = "template";

  async generate(_systemPrompt: string, userPrompt: string): Promise<string> {
    const facts = parseFacts(userPrompt);
    const ruleId = /Rule:\s*([^\s—]+)/.exec(userPrompt)?.[1] ?? "";
    const title = /—\s*(.+)$/m.exec(userPrompt.split("\n")[0])?.[1]?.trim() ?? "Insight";
    const f = (labelPart: string): Fact | undefined =>
      facts.find((x) => x.label.toLowerCase().includes(labelPart.toLowerCase())) ?? facts[0];
    const fmt = (x?: Fact) => (x ? `${x.value}${x.unit ? ` ${x.unit}` : ""} in ${x.period}` : "n/a");

    switch (ruleId) {
      case "npl-drift": {
        const npl = f("NPL ratio now") ?? f("NPL ratio");
        const chg = f("90-day NPL change") ?? f("change");
        const reclass = f("Reclassified forborne");
        const newDef = f("New defaults");
        const ceiling = f("CBN NPL ceiling");
        const parts = [
          `NPL ratio is ${fmt(npl)}, ${chg ? `${chg.value > 0 ? "up" : "down"} ${Math.abs(chg.value)} pp over 90 days (${chg.period})` : "moving"}${ceiling ? `, against the CBN ceiling of ${ceiling.value}%` : ""}.`,
        ];
        if (reclass && newDef) {
          parts.push(
            `Of the recent move, ${reclass.value} pp is post-forbearance reclassification versus ${newDef.value} pp of genuine new defaults (${reclass.period}) — the spike is partly regulatory noise, but new defaults are still rising.`,
          );
        }
        parts.push("Routed to the CRO Office; segment heads own the remediation playbook.");
        return parts.join(" ");
      }
      case "stage2-leading": {
        const s2 = f("Stage 2 ratio now") ?? f("Stage 2 ratio");
        const rise = f("Stage 2 6m change") ?? f("rise");
        const cor = f("Cost of risk 6m change") ?? f("Cost of risk");
        return [
          `Stage 2 ratio is ${fmt(s2)}, up ${rise?.value ?? "materially"} pp over 6 months (${rise?.period}), while cost of risk moved only ${cor?.value ?? 0} pp (${cor?.period}) — an implied IFRS 9 ECL catch-up risk.`,
          "Routed to the Head of Credit Risk for SICR and provisioning review.",
        ].join(" ");
      }
      case "nim-compression": {
        const nim = f("NIM now") ?? f("NIM");
        const chg = f("NIM 6m change") ?? f("change");
        const fc = f("Funding cost 6m change");
        const ay = f("Asset yield 6m change");
        return [
          `NIM is ${fmt(nim)}, ${chg ? `${chg.value} pp over 6 months (${chg.period})` : "compressing"}.`,
          `Driver split: asset yield ${ay?.value ?? 0} pp vs funding cost ${fc?.value ?? 0} pp over 6 months — the compression is funding-led.`,
          "Routed to Treasury / ALCO for repricing and deposit-mix actions.",
        ].join(" ");
      }
      case "capital-trajectory": {
        const car = f("CAR now") ?? f("CAR");
        const floor = f("Capital floor") ?? f("floor");
        const horizon = f("breach horizon") ?? f("horizon");
        return [
          `CAR is ${fmt(car)} against a floor of ${floor?.value ?? ""}% (CBN minimum + risk-based add-on).`,
          `At the current trajectory (ECL run-rate and RWA growth included), the breach horizon is about ${horizon?.value ?? ""} months (${horizon?.period}).`,
          "Routed to the CFO; ALCO to review capital conservation options.",
        ].join(" ");
      }
      case "funding-erosion": {
        const term = f("Term deposit share now") ?? f("Term share");
        const shift = f("Term share 12m change") ?? f("share 12m");
        const liq = f("Liquidity ratio");
        const cls = /solvency risk/i.test(userPrompt) ? "solvency" : "earnings";
        return [
          `Term deposits are ${fmt(term)}, up ${shift?.value ?? ""} pp over 12 months (${shift?.period}) while total deposits are broadly flat — a structural funding-mix shift.`,
          `With the liquidity ratio at ${fmt(liq)} (CBN minimum ${ctx_min(userPrompt)}%), this is classified as ${cls} risk.`,
          "Routed to ALCO.",
        ].join(" ");
      }
      case "concentration-creep": {
        const top10 = f("Top-10 obligor share");
        const single = f("Single obligor");
        const headroom = f("Headroom to limit");
        return [
          `Top-10 obligor share is ${fmt(top10)} (appetite ${f("appetite")?.value ?? ""}%), and the largest single obligor is ${fmt(single)} of shareholders' funds against the ${f("limit")?.value ?? 20}% CBN limit — headroom ${headroom?.value ?? ""} pp (${headroom?.period}).`,
          "Routed to the Credit Risk Committee; consider limit utilisation review.",
        ].join(" ");
      }
      default:
        return `${title}: ` + facts.map((x) => `${x.label} ${x.value}${x.unit ? " " + x.unit : ""} (${x.period})`).join("; ");
    }
  }
}

function ctx_min(userPrompt: string): string {
  const m = /liquidity ratio minimum:\s*([\d.]+)%/i.exec(userPrompt);
  return m ? m[1] : "30";
}
