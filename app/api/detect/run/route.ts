import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime, detectContextAsync } from "../../../../lib/demo/bootstrap.ts";
import { runDetectors } from "../../../../lib/detect/index.ts";

export async function POST(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    const ctx = await detectContextAsync(rt);
    const result = await runDetectors(ctx);
    return json({ ok: true, ...result, ranAt: new Date().toISOString() });
  });
}

export async function GET(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    return json({ rules: (await import("../../../../lib/detect/index.ts")).RULES.map((r) => ({ id: r.id, domain: r.domain, title: r.title, description: r.description })) });
  });
}
