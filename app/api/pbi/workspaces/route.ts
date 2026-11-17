import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    return json({ workspaces: await rt.pbi.listWorkspaces(rt.identity), mode: rt.pbi.mode });
  });
}
