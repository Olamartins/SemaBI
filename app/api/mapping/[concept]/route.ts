import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import { setMapping, certifyMapping } from "../../../../lib/mapping/store.ts";
import { gapRemediation } from "../../../../lib/mapping/gaps.ts";
import { suggestMeasures } from "../../../../lib/mapping/suggest.ts";
import { conceptByKey } from "../../../../lib/ontology/index.ts";

export async function GET(req: NextRequest, { params }: { params: { concept: string } }) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const concept = conceptByKey(params.concept);
    if (!concept) return json({ error: "unknown concept" }, 404);
    const mapping = await rt.store.getMapping(params.concept);
    const metadata = await rt.pbi.getMetadata(identity, rt.datasetId);
    return json({
      concept,
      mapping,
      suggestions: suggestMeasures(concept, metadata),
      gap: gapRemediation(params.concept, metadata, mapping),
    });
  });
}

export async function PUT(req: NextRequest, { params }: { params: { concept: string } }) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const body = (await req.json()) as { measureName?: string | null; dimensions?: Record<string, string>; action?: "certify" | "draft" };
    let mapping;
    if (body.action === "certify") {
      mapping = await certifyMapping(rt.store, params.concept, identity.userId);
    } else {
      mapping = await setMapping(rt.store, params.concept, {
        measureName: body.measureName !== undefined ? body.measureName : undefined,
        dimensions: body.dimensions,
        status: body.action === "draft" ? "draft" : undefined,
      });
    }
    await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action: `mapping.update`, detail: { concept: params.concept, status: mapping.status, measure: mapping.measureName } });
    return json({ ok: true, mapping });
  });
}
