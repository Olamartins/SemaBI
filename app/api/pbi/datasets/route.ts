import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    const ws = req.nextUrl.searchParams.get("workspaceId") ?? rt.workspaceId;
    return json({ datasets: await rt.pbi.listDatasets(rt.identity, ws), reports: await rt.pbi.listReports(rt.identity, ws) });
  });
}
