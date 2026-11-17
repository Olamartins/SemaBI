import { cookies } from "next/headers";
import { getRuntime } from "../../../lib/demo/bootstrap.ts";
import { demoIdentity, DEMO_USERS, canAdmin } from "../../../lib/auth/roles.ts";
import { currentPeriod } from "../../../lib/util.ts";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const identity = demoIdentity(cookies().get("semabi_demo_user")?.value);
  const rt = await getRuntime({ forceIdentity: identity });
  const isAdmin = canAdmin(identity.roles);
  const freshness = await rt.store.getFreshness();
  const audit = isAdmin ? await rt.store.listAudit(100) : [];
  const settings: Record<string, string | null> = {
    workspaceId: (await rt.store.getSetting("workspaceId")) ?? rt.workspaceId,
    datasetId: (await rt.store.getSetting("datasetId")) ?? rt.datasetId,
    ingestSchedule: (await rt.store.getSetting("ingestSchedule")) ?? process.env.INGEST_SCHEDULE ?? "05:30",
    digestSchedule: (await rt.store.getSetting("digestSchedule")) ?? process.env.DIGEST_SCHEDULE ?? "07:00",
  };
  const ws = await rt.pbi.listWorkspaces(identity);
  const ds = await rt.pbi.listDatasets(identity, rt.workspaceId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Admin</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Workspace / dataset selection</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="td font-semibold w-40">Workspace</td><td className="td">{ws.map((w: { id: string; name: string }) => `${w.name} (${w.id})`).join(", ")}</td></tr>
              <tr><td className="td font-semibold">Datasets</td><td className="td">{ds.map((d: { id: string; name: string; isCertified: boolean }) => `${d.name}${d.isCertified ? " ★certified" : ""}`).join("; ")}</td></tr>
              {Object.entries(settings).map(([k, v]) => (
                <tr key={k}><td className="td font-semibold">{k}</td><td className="td font-mono text-xs">{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Schedules are configurable (INGEST_SCHEDULE / DIGEST_SCHEDULE env or settings store). Nightly ingest default 05:30; digest 07:00 per role.</p>
        </div>

        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Ingestion freshness monitor</h3>
          <table className="w-full text-sm">
            <thead><tr><th className="th">Concept</th><th className="th">Latest period</th><th className="th">Ingested at</th></tr></thead>
            <tbody>
              {freshness.map((f) => (
                <tr key={f.concept}>
                  <td className="td font-mono text-xs">{f.concept}</td>
                  <td className="td">{f.period}{f.period === currentPeriod() ? "" : " (stale)"}</td>
                  <td className="td text-xs">{new Date(f.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">User roles & RLS scope (demo directory)</h3>
        <table className="w-full text-sm">
          <thead><tr><th className="th">User</th><th className="th">Roles</th><th className="th">RLS</th><th className="th">Mode</th></tr></thead>
          <tbody>
            {Object.values(DEMO_USERS).map((u) => (
              <tr key={u.userId}>
                <td className="td">{u.displayName}<div className="font-mono text-xs text-slate-500">{u.userId}</div></td>
                <td className="td">{u.roles.join(", ")}</td>
                <td className="td font-mono text-xs">{JSON.stringify(u.rls) || "— (full scope)"}</td>
                <td className="td">{u.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Audit log {isAdmin ? "" : "(BI_ADMIN role required to view)"}</h3>
        {isAdmin ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr><th className="th">At</th><th className="th">Actor</th><th className="th">Action</th><th className="th">Detail</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="td text-xs">{new Date(a.at).toLocaleString()}</td>
                    <td className="td text-xs">{a.actor}</td>
                    <td className="td">{a.action}</td>
                    <td className="td font-mono text-xs max-w-xl truncate">{JSON.stringify(a.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Switch to the BI Admin persona to view the audit log.</p>
        )}
      </div>
    </div>
  );
}
