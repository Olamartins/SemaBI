import { NextRequest } from "next/server";
import { json, withError } from "../../../../lib/api-helpers.ts";
import { DEMO_USERS, demoIdentity } from "../../../../lib/auth/roles.ts";

export async function GET() {
  return json({
    mode: "demo",
    users: Object.entries(DEMO_USERS).map(([id, u]) => ({ userId: id, displayName: u.displayName, roles: u.roles, rls: u.rls })),
  });
}

/** Switch demo persona (sets cookie). Prod uses OIDC SSO via Entra ID. */
export async function POST(req: NextRequest) {
  return withError(async () => {
    const contentType = req.headers.get("content-type") ?? "";
    let userId: string | undefined;
    if (contentType.includes("application/json")) {
      userId = ((await req.json()) as { userId?: string }).userId;
    } else {
      const form = await req.formData();
      userId = String(form.get("userId") ?? undefined);
    }
    const identity = demoIdentity(userId);
    const res = json({ ok: true, user: { userId: identity.userId, displayName: identity.displayName, roles: identity.roles, rls: identity.rls } });
    res.cookies.set("semabi_demo_user", identity.userId, { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  });
}
