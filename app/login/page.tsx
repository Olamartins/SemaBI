import { DEMO_USERS } from "../../lib/auth/roles.ts";
import { isDemoMode } from "../../lib/pbi/index.ts";

export default function LoginPage() {
  if (!isDemoMode()) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="card p-8 max-w-md">
          <h1 className="text-xl font-bold mb-2">Sign in with Microsoft Entra ID</h1>
          <p className="text-sm text-slate-400 mb-4">Production mode uses OIDC single sign-on. App roles (CRO, ALCO, CFO, Risk, BI Admin) are mapped from Entra ID app role claims.</p>
          <form action="/api/auth/providers/azure-ad/signin" method="POST">
            <button className="btn btn-accent" type="submit">Sign in with Microsoft</button>
          </form>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-1">SemaBI <span className="text-accent">demo mode</span></h1>
        <p className="text-sm text-slate-400 mb-6">
          Pick a persona. Each persona carries its own effective identity and RLS scope — every Power BI query runs under it.
        </p>
        <div className="grid gap-2">
          {Object.entries(DEMO_USERS).map(([id, u]) => (
            <form key={id} action="/api/auth/demo" method="POST" className="flex items-center justify-between gap-3 rounded-lg bg-ink-850 px-4 py-3 border border-ink-700">
              <div>
                <div className="font-medium">{u.displayName}</div>
                <div className="text-xs text-slate-400">{id} · roles: {u.roles.join(", ")}{Object.keys(u.rls).length ? ` · RLS: ${JSON.stringify(u.rls)}` : ""}</div>
              </div>
              <input type="hidden" name="userId" value={id} />
              <button className="btn btn-accent" type="submit">Enter</button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
