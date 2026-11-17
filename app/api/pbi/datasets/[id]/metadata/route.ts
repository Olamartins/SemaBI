import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../../../lib/demo/bootstrap.ts";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withError(async () => {
    const rt = await getRuntime({ forceIdentity: identityFromRequest(req) });
    return json(await rt.pbi.getMetadata(rt.identity, params.id));
  });
}
