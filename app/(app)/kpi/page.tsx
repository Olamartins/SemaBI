import { cookies } from "next/headers";
import { getRuntime } from "../../../lib/demo/bootstrap.ts";
import { demoIdentity } from "../../../lib/auth/roles.ts";
import { LineChartCard } from "../../../components/charts.tsx";
import { currentPeriod, fmtPct } from "../../../lib/util.ts";

export const dynamic = "force-dynamic";

interface KpiDef {
  concept: string;
  label: string;
  unit: string;
  kind: "max" | "min" | "watch";
  threshold?: number;
  thresholdLabel?: string;
  playbook?: string;
}

export default async function KpiPage() {
  const identity = demoIdentity(cookies().get("semabi_demo_user")?.value);
  const rt = await getRuntime({ forceIdentity: identity });
  const t = rt.thresholds;
  const now = currentPeriod();

  const defs: KpiDef[] = [
    { concept: "asset_quality.npl_ratio", label: "NPL Ratio", unit: "%", kind: "max", threshold: t.nplThresholdPct, thresholdLabel: "CBN 5%", playbook: "npl-drift" },
    { concept: "capital.car", label: "CAR", unit: "%", kind: "min", threshold: t.carMinimumPct + t.carRiskAddOnPct, thresholdLabel: `floor ${t.carMinimumPct}%+${t.carRiskAddOnPct}% add-on`, playbook: "capital-trajectory" },
    { concept: "capital.cet1_ratio", label: "CET1 Ratio", unit: "%", kind: "min", threshold: t.cet1MinimumPct, thresholdLabel: `CBN ${t.cet1MinimumPct}%` },
    { concept: "liquidity.liquidity_ratio", label: "Liquidity Ratio", unit: "%", kind: "min", threshold: t.liquidityRatioMinimumPct, thresholdLabel: "CBN 30%", playbook: "funding-erosion" },
    { concept: "liquidity.lcr", label: "LCR", unit: "%", kind: "min", threshold: t.lcrMinimumPct, thresholdLabel: "CBN 100%" },
    { concept: "profitability.nim", label: "NIM", unit: "%", kind: "watch", playbook: "nim-compression" },
    { concept: "profitability.cost_to_income", label: "Cost-to-Income", unit: "%", kind: "watch" },
    { concept: "liquidity.ldr", label: "LDR", unit: "%", kind: "watch" },
    { concept: "concentration.single_obligor_pct", label: "Single Obligor % Funds", unit: "%", kind: "max", threshold: t.singleObligorLimitPctOfFunds, thresholdLabel: "CBN 20% (5% insiders)", playbook: "concentration-creep" },
    { concept: "concentration.top10_obligor_share", label: "Top-10 Obligor Share", unit: "%", kind: "max", threshold: t.top10ObligorAppetitePct, thresholdLabel: `appetite ${t.top10ObligorAppetitePct}%`, playbook: "concentration-creep" },
  ];

  const kpis = [];
  for (const d of defs) {
    const series = await rt.store.getSeries(d.concept, {}, undefined, now);
    const last12 = series.slice(-12);
    const cur = last12[last12.length - 1];
    const prev = last12[last12.length - 4];
    let state: "breach" | "watch" | "ok" = "ok";
    if (cur) {
      if (d.kind === "max" && d.threshold !== undefined && cur.value > d.threshold) state = "breach";
      else if (d.kind === "min" && d.threshold !== undefined && cur.value < d.threshold) state = "breach";
      else if (d.kind === "watch" && prev && Math.abs(cur.value - prev.value) > 0.5) state = "watch";
      else if (d.kind === "max" && d.threshold !== undefined && cur.value > d.threshold * 0.9) state = "watch";
      else if (d.kind === "min" && d.threshold !== undefined && cur.value < d.threshold * 1.1) state = "watch";
    }
    kpis.push({ ...d, series: last12, cur: cur?.value, delta3m: prev && cur ? cur.value - prev.value : null, state });
  }

  const stateStyle = {
    breach: "bg-danger/20 text-danger border-danger/50",
    watch: "bg-warn/20 text-warn border-warn/50",
    ok: "bg-ok/20 text-ok border-ok/40",
  } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">CBN Prudential Scorecard</h1>
        <span className="text-sm text-slate-400">12-month trends · as of {now}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.concept} className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">{k.label}</span>
              <span className={`badge border ${stateStyle[k.state]}`}>{k.state.toUpperCase()}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{k.cur !== undefined ? `${k.cur.toFixed(2)}${k.unit === "%" ? "%" : ` ${k.unit}`}` : "—"}</span>
              {k.delta3m !== null && <span className={`text-xs ${k.delta3m <= 0 ? "text-ok" : "text-warn"}`}>{k.delta3m > 0 ? "+" : ""}{k.delta3m.toFixed(2)} pp / 3m</span>}
            </div>
            {k.threshold !== undefined && <div className="text-xs text-slate-500">{k.thresholdLabel}: {k.threshold}%</div>}
            <LineChartCard
              title=""
              height={90}
              data={k.series.map((p) => ({ period: p.period, value: p.value }))}
              series={[{ key: "value", color: k.state === "breach" ? "#f43f5e" : k.state === "watch" ? "#f59e0b" : "#34d399" }]}
              referenceLines={k.threshold !== undefined ? [{ y: k.threshold, label: "limit", color: "#f43f5e" }] : []}
            />
            {k.playbook && <a className="btn w-fit" href={`/playbooks/${k.playbook}`}>Open playbook →</a>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Thresholds are configurable rule parameters (config/rules.default.json, CBN reference: NPL 5%, CAR 10% + risk add-ons, CET1 10.5%, liquidity 30%, LCR 100%, single obligor 20%/5% insiders).</p>
    </div>
  );
}
