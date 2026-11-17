import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../lib/api-helpers.ts";
import { getRuntime, mappingCoverage } from "../../../lib/demo/bootstrap.ts";
import { initMappings } from "../../../lib/mapping/store.ts";
import { ALL_CONCEPTS } from "../../../lib/ontology/index.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    const mappings = await rt.store.getMappings();
    const cov = await mappingCoverage(rt);
    return json({ mappings, coverage: cov.coverage, gaps: cov.gaps, concepts: ALL_CONCEPTS.map((c) => ({ key: c.key, label: c.label, domain: c.domain, unit: c.unit, requiredDimensions: c.requiredDimensions })) });
  });
}

/** (Re)initialise mappings from model metadata with auto-suggestions. */
export async function POST(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const metadata = await rt.pbi.getMetadata(identity, rt.datasetId);
    const mappings = await initMappings(rt.store, metadata);
    await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action: "mapping.init", detail: { count: mappings.length } });
    return json({ ok: true, mappings });
  });
}
