import { NextRequest, NextResponse } from "next/server";
import type { EffectiveIdentity } from "./types.ts";
import { demoIdentity } from "./auth/roles.ts";
import { isDemoMode } from "./pbi/index.ts";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function err(error: unknown, status = 500): NextResponse {
  const e = error as Error;
  return NextResponse.json({ error: e.name ?? "Error", message: e.message }, { status });
}

/** Effective identity for the request. Demo: x-demo-user header / cookie. Prod: OIDC session (middleware). */
export function identityFromRequest(req: NextRequest): EffectiveIdentity {
  if (!isDemoMode()) {
    // In prod the OIDC session (middleware) is the source of truth; API routes receive
    // the verified identity via the session — here we fail closed if absent.
    const sessionUser = req.headers.get("x-oidc-user");
    if (!sessionUser) throw new Error("No OIDC session; production mode requires authenticated requests");
    return demoIdentity(sessionUser);
  }
  const user = req.headers.get("x-demo-user") ?? req.cookies.get("semabi_demo_user")?.value ?? undefined;
  return demoIdentity(user);
}

export function roleOf(identity: EffectiveIdentity): string {
  return identity.roles[0] ?? "RISK";
}

export async function withError<T>(fn: () => Promise<T | NextResponse>): Promise<NextResponse> {
  try {
    const r = await fn();
    if (r instanceof Response) return r as NextResponse; // route already built a response (e.g. with cookie)
    return json(r);
  } catch (e) {
    const msg = (e as Error).message;
    const status = /identity|RLS/i.test(msg) ? 403 : /not found/i.test(msg) ? 404 : 500;
    return err(e, status);
  }
}
