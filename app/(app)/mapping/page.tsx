import { cookies } from "next/headers";
import type { Mapping } from "../../../lib/types.ts";
import { getRuntime, mappingCoverage } from "../../../lib/demo/bootstrap.ts";
import { demoIdentity } from "../../../lib/auth/roles.ts";
import { ALL_CONCEPTS, domainByKey } from "../../../lib/ontology/index.ts";
import { suggestMeasures } from "../../../lib/mapping/suggest.ts";
import MappingRow from "../../../components/MappingRow.tsx";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const identity = demoIdentity(cookies().get("semabi_demo_user")?.value);
  const rt = await getRuntime({ forceIdentity: identity });
  const mappings = await rt.store.getMappings();
  const metadata = await rt.pbi.getMetadata(identity, rt.datasetId);
  const cov = await mappingCoverage(rt);
  const byConcept = new Map(mappings.map((m: Mapping) => [m.concept, m]));

  const domains = [...new Set(ALL_CONCEPTS.map((c) => c.domain))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Semantic Model Mapping</h1>
        <span className="badge bg-accent/20 text-accent border border-accent/40">
          certified {cov.coverage.certified}/{cov.coverage.total} ({cov.coverage.pct}%)
        </span>
        <span className="text-sm text-slate-400">dataset: {rt.datasetId}</span>
      </div>
      <p className="text-sm text-slate-400">
        Map each banking-ontology concept to a measure in the certified semantic model. Auto-suggestions are pre-selected from fuzzy matching — a human confirms; only{" "}
        <b>certified</b> mappings feed production insights.
      </p>
      {cov.gaps.length > 0 && (
        <div className="card p-4 border-warn/40">
          <h3 className="mb-2 text-sm font-semibold text-warn">Gap remediation — suggested DAX for missing measures</h3>
          <div className="grid gap-2">
            {cov.gaps.map((g) => (
              <details key={g.concept} className="rounded-lg bg-ink-850 p-3">
                <summary className="cursor-pointer text-sm">{g.label} ({g.concept}) — {g.note}</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-3 text-xs font-mono text-slate-300">{g.suggestedDax}</pre>
              </details>
            ))}
          </div>
        </div>
      )}
      {domains.map((d) => (
        <div key={d} className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">{domainByKey(d)?.label ?? d}</h2>
          <div className="flex flex-col gap-2">
            {ALL_CONCEPTS.filter((c) => c.domain === d).map((c) => (
              <MappingRow
                key={c.key}
                concept={c}
                mapping={byConcept.get(c.key) ?? null}
                measures={metadata.measures.map((m) => m.name)}
                suggestions={suggestMeasures(c, metadata)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
