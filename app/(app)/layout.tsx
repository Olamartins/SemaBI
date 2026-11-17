import Link from "next/link";
import { cookies } from "next/headers";
import { DEMO_USERS, demoIdentity } from "../../lib/auth/roles.ts";
import { isDemoMode } from "../../lib/pbi/index.ts";
import RoleSwitcher from "../../components/RoleSwitcher.tsx";

const NAV = [
  { href: "/digest", label: "Morning Digest" },
  { href: "/kpi", label: "KPI Explorer" },
  { href: "/playbooks/npl-drift", label: "Playbooks" },
  { href: "/mapping", label: "Semantic Mapping" },
  { href: "/admin", label: "Admin" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = cookies().get("semabi_demo_user")?.value;
  const identity = demoIdentity(persona);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link href="/digest" className="text-lg font-bold tracking-tight">
            Sema<span className="text-accent">BI</span>
            {isDemoMode() && <span className="ml-2 badge bg-warn/20 text-warn border border-warn/40">demo</span>}
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-ink-800 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-400 hidden md:inline">{identity.displayName}</span>
            <span className="badge bg-ink-700 text-slate-300">{identity.roles.join(" · ")}</span>
            {isDemoMode() && <RoleSwitcher users={DEMO_USERS} current={identity.userId} />}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
