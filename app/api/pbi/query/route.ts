import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import type { AggregateQuery } from "../../../../lib/types.ts";
/**
 * Execute an aggregate DAX query under the caller's effective identity.
 * Fails closed (403) if no identity can be established — RLS is never bypassed.
 */
export async function POST(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const body = (await req.json()) as { datasetId?: string; query: AggregateQuery };
    const rows = await rt.pbi.executeAggregate(identity, body.datasetId ?? rt.datasetId, body.query);
    await rt.store.audit({
      at: new Date().toISOString(),
      actor: identity.userId,
      action: "api.pbi.query",
      detail: { measure: body.query.measure, from: body.query.from, to: body.query.to, rows: rows.length, rls: identity.rls, mode: identity.mode },
    });
    return json({ rows, rlsAppliedByTenant: true, identity: { userId: identity.userId, mode: identity.mode, rls: identity.rls } });
  });
}
