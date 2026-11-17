import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import { runIngestion } from "../../../../lib/ingest/pipeline.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    return json({ freshness: await rt.store.getFreshness(), schedule: process.env.INGEST_SCHEDULE ?? "05:30" });
  });
}

export async function POST(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const mappings = await rt.store.getMappings();
    const results = await runIngestion({
      store: rt.store,
      pbi: rt.pbi,
      datasetId: rt.datasetId,
      identity,
      mappings,
      audit: async (action, detail) => {
        await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action, detail });
      },
    });
    return json({ ok: true, ranAt: new Date().toISOString(), results });
  });
}
