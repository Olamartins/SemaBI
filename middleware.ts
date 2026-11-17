import { NextRequest, NextResponse } from "next/server";

/**
 * Auth gate. Demo mode: persona cookie/header (set via /api/auth/demo).
 * Prod mode: OIDC session via Entra ID (next-auth) must exist — requests without a
 * verified session are redirected to /login. Power BI queries always execute under
 * the signed-in user's effective identity (see lib/pbi/identity.ts).
 */
export function middleware(req: NextRequest) {
  const demo = (process.env.SEMABI_MODE ?? "demo") !== "prod";
  if (demo) {
    const hasPersona = req.cookies.has("semabi_demo_user") || req.headers.has("x-demo-user");
    if (!hasPersona && !req.nextUrl.pathname.startsWith("/login") && !req.nextUrl.pathname.startsWith("/api/auth") && !req.nextUrl.pathname.startsWith("/api/health")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  const session = req.cookies.get("authjs.session-token") ?? req.cookies.get("__Secure-authjs.session-token");
  if (!session && !req.nextUrl.pathname.startsWith("/login") && !req.nextUrl.pathname.startsWith("/api/auth")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
