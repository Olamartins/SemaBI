import { NextRequest } from "next/server";
import { json, withError, identityFromRequest } from "../../../../lib/api-helpers.ts";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import { canAdmin } from "../../../../lib/auth/roles.ts";

const KEYS = ["workspaceId", "datasetId", "ingestSchedule", "digestSchedule"];

export async function GET(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    if (!canAdmin(identity.roles)) return json({ error: "BI_ADMIN role required" }, 403);
    const rt = await getRuntime({ forceIdentity: identity });
    const out: Record<string, string | null> = {};
    for (const k of KEYS) out[k] = (await rt.store.getSetting(k)) ?? (k === "workspaceId" ? rt.workspaceId : k === "datasetId" ? rt.datasetId : k === "ingestSchedule" ? process.env.INGEST_SCHEDULE ?? "05:30" : process.env.DIGEST_SCHEDULE ?? "07:00");
    return json({ settings: out });
  });
}

export async function POST(req: NextRequest) {
  return withError(async () => {
    const identity = identityFromRequest(req);
    if (!canAdmin(identity.roles)) return json({ error: "BI_ADMIN role required" }, 403);
    const rt = await getRuntime({ forceIdentity: identity });
    const body = (await req.json()) as Record<string, string>;
    for (const k of KEYS) {
      if (body[k] !== undefined) {
        await rt.store.setSetting(k, body[k]);
        await rt.store.audit({ at: new Date().toISOString(), actor: identity.userId, action: "admin.setting", detail: { key: k, value: body[k] } });
      }
    }
    return json({ ok: true });
  });
}
