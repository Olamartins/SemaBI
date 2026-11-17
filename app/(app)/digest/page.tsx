import Link from "next/link";
import { getRuntime } from "../../../lib/demo/bootstrap.ts";
import { roleSeesInsight, DEMO_USERS } from "../../../lib/auth/roles.ts";
import { ALL_ROLES } from "../../../lib/auth/roles.ts";
import type { AppRole } from "../../../lib/types.ts";
import InsightCard from "../../../components/InsightCard.tsx";
import { severityRank } from "../../../lib/detect/framework.ts";
import { cookies } from "next/headers";
import { demoIdentity } from "../../../lib/auth/roles.ts";

export const dynamic = "force-dynamic";

export default async function DigestPage({ searchParams }: { searchParams: { role?: string } }) {
  const persona = cookies().get("semabi_demo_user")?.value;
  const identity = demoIdentity(persona);
  const role = (searchParams.role ?? identity.roles[0] ?? "CRO") as AppRole;
  const rt = await getRuntime({ forceIdentity: identity });
  const all = await rt.store.listInsights({});
  const insights = all.filter((i) => roleSeesInsight(role, i)).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt.localeCompare(a.createdAt));
  const owners = Object.keys(DEMO_USERS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-4">Morning Digest</h1>
        {ALL_ROLES.filter((r) => r !== "BI_ADMIN").map((r) => (
          <Link key={r} href={`/digest?role=${r}`} className={`badge border ${r === role ? "bg-accent/20 text-accent border-accent/40" : "bg-ink-800 text-slate-300 border-ink-700"}`}>
            {r} view
          </Link>
        ))}
        <span className="ml-auto text-sm text-slate-400">{insights.length} insight(s) for {role}</span>
      </div>
      {insights.length === 0 && <div className="card p-8 text-center text-slate-400">No insights for this role yet. Trigger a detection run from Admin.</div>}
      <div className="grid gap-4">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} owners={owners} />
        ))}
      </div>
    </div>
  );
}
