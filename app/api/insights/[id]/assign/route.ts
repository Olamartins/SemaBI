import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../../lib/demo/bootstrap.ts";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const body = (await req.json()) as { assignedTo: string };
    if (!body.assignedTo) return json({ error: "assignedTo required" }, 400);
    const insight = await rt.store.getInsight(params.id);
    if (!insight) return json({ error: "not found" }, 404);
    await rt.store.updateInsight(params.id, { status: "assigned", assignedTo: body.assignedTo });
    await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action: "insight.assign", detail: { insightId: params.id, assignedTo: body.assignedTo } });
    return json({ ok: true, status: "assigned", assignedTo: body.assignedTo });
  });
}
