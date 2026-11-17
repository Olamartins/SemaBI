import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../lib/api-helpers.ts";
import { getRuntime } from "../../../lib/demo/bootstrap.ts";
import { composeDigest, deliverDigest } from "../../../lib/notify/digest.ts";
import type { AppRole } from "../../../lib/types.ts";
import { currentPeriod } from "../../../lib/util.ts";

export async function GET(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    const rt = await getRuntime({ forceIdentity: identity });
    const role = (req.nextUrl.searchParams.get("role") ?? identity.roles[0] ?? "CRO") as AppRole;
    const insights = await rt.store.listInsights({});
    const digest = composeDigest(role, insights, currentPeriod());
    const send = req.nextUrl.searchParams.get("send") === "1";
    const delivery = send ? await deliverDigest(digest, [identity.userId]) : null;
    return json({ digest: { ...digest, teamsCards: undefined, emailHtml: undefined }, cards: digest.teamsCards.length, delivery });
  });
}
