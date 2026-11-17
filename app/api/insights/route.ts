import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../lib/api-helpers.ts";
import { getRuntime } from "../../../lib/demo/bootstrap.ts";
import { roleSeesInsight } from "../../../lib/auth/roles.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const role = req.nextUrl.searchParams.get("role") ?? identity.roles[0] ?? "CRO";
    const ruleId = req.nextUrl.searchParams.get("ruleId") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    let insights = await rt.store.listInsights({ ruleId, status });
    insights = insights.filter((i) => roleSeesInsight(role as never, i));
    return json({ insights, role });
  });
}
