import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../../lib/demo/bootstrap.ts";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const insight = await rt.store.getInsight(params.id);
    if (!insight) return json({ error: "not found" }, 404);
    await rt.store.updateInsight(params.id, { status: "acknowledged" });
    await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action: "insight.acknowledge", detail: { insightId: params.id, ruleId: insight.ruleId } });
    return json({ ok: true, status: "acknowledged" });
  });
}
