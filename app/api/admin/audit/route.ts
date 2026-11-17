import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import { canAdmin } from "../../../../lib/auth/roles.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    if (!canAdmin(identity.roles)) return json({ error: "BI_ADMIN role required" }, 403);
    const rt = await getRuntime({ forceIdentity: identity });
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 200);
    return json({ audit: await rt.store.listAudit(limit) });
  });
}
