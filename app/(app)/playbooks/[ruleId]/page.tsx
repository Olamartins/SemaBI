import { cookies } from "next/headers";
import Link from "next/link";
import { getRuntime } from "../../../../lib/demo/bootstrap.ts";
import { demoIdentity, DEMO_USERS } from "../../../../lib/auth/roles.ts";
import { RULES } from "../../../../lib/detect/index.ts";
import { LineChartCard, BarChartCard } from "../../../../components/charts.tsx";
import InsightCard from "../../../../components/InsightCard.tsx";
import SeverityBadge from "../../../../components/SeverityBadge.tsx";

export const dynamic = "force-dynamic";

type Charts = Record<string, any>;

export default async function PlaybookPage({ params }: { params: { ruleId: string } }) {
  const identity = demoIdentity(cookies().get("semabi_demo_user")?.value);
  const rt = await getRuntime({ forceIdentity: identity });
  const rule = RULES.find((r) => r.id === params.ruleId);
  if (!rule) return <div className="card p-8">Unknown playbook. <Link href="/digest" className="text-accent">Back to digest</Link></div>;
  const insights = (await rt.store.listInsights({ ruleId: rule.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = insights[0];
  const c = (latest?.diagnostics ?? {}) as Charts;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{rule.title}</h1>
        <p className="text-sm text-slate-400">{rule.description}</p>
      </div>

      {latest && <InsightCard insight={latest} owners={Object.keys(DEMO_USERS)} />}

      {latest && (
        <>
          <h2 className="text-lg font-semibold mt-2">Diagnostic evidence — {latest.createdPeriod}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {rule.id === "npl-drift" && (
              <>
                <LineChartCard title="NPL trend vs CBN ceiling" data={c.nplTrend ?? []} series={[{ key: "npl", color: "#f43f5e" }]} referenceLines={[{ y: rt.thresholds.nplThresholdPct, label: "CBN 5%", color: "#f43f5e" }]} />
                <BarChartCard title="NPL by segment: now vs 90 days ago (pp Δ)" data={(c.segmentDecomp ?? []).map((s: any) => ({ segment: s.segment, now: s.now, ago90d: s.ago90d }))} xKey="segment" series={[{ key: "now", color: "#38bdf8" }, { key: "ago90d", color: "#64748b" }]} />
                <BarChartCard title="Driver split: last 90d vs prior 90d (pp)" data={(c.driverSplit ?? []).map((d: any) => ({ driver: d.driver, recent90d: d.recent90d, prior90d: d.prior90d }))} xKey="driver" series={[{ key: "recent90d", color: "#f59e0b" }, { key: "prior90d", color: "#64748b" }]} />
                <BarChartCard title="Vintage default rate by cohort (%)" data={c.vintage ?? []} xKey="cohort" series={[{ key: "defaultRate", color: "#f43f5e" }]} />
                <div className="card p-4">
                  <h4 className="mb-2 text-sm font-semibold text-slate-300">Reclassification vs new defaults</h4>
                  <p className="text-sm text-slate-300">
                    Share of the recent NPL move attributable to post-forbearance reclassification:{" "}
                    <b className="text-warn">{((c.reclassificationShareOfMove ?? 0) * 100).toFixed(0)}%</b>. A high share means the spike is largely regulatory noise; genuine new defaults are tracked separately above.
                  </p>
                  {c.seasonality && <p className="mt-2 text-xs text-slate-400">Seasonality check: YoY same-month Δ {c.seasonality.yoyDeltaPp} pp (same month last year {c.seasonality.sameMonthLastYear}%).</p>}
                </div>
              </>
            )}
            {rule.id === "stage2-leading" && (
              <>
                <LineChartCard title="Stage 2 ratio trend" data={c.stage2Trend ?? []} series={[{ key: "stage2", color: "#f59e0b" }]} />
                <LineChartCard title="Cost of risk trend (lags Stage 2)" data={c.corTrend ?? []} series={[{ key: "costOfRisk", color: "#38bdf8" }]} />
                <LineChartCard title="Provision coverage" data={c.coverageTrend ?? []} series={[{ key: "coverage", color: "#34d399" }]} />
                <div className="card p-4 text-sm text-slate-300">Implied ECL catch-up risk (Stage 2 build × uncovered share): <b className="text-warn">{c.impliedEclCatchUpPp ?? "n/a"} pp</b></div>
              </>
            )}
            {rule.id === "nim-compression" && (
              <>
                <LineChartCard title="NIM trend" data={c.nimTrend ?? []} series={[{ key: "nim", color: "#f43f5e" }]} />
                <LineChartCard title="Asset yield vs funding cost" data={c.yieldVsFunding ?? []} series={[{ key: "assetYield", color: "#34d399" }, { key: "fundingCost", color: "#f59e0b" }]} />
                <LineChartCard title="Deposit mix (share %)" data={(c.depositMixTrend?.[0]?.series ?? []).map((p: any, i: number) => ({ period: p.period, ...Object.fromEntries((c.depositMixTrend ?? []).map((t: any) => [t.type, t.series[i]?.share])) }))} series={(c.depositMixTrend ?? []).map((t: any, i: number) => ({ key: t.type, color: ["#38bdf8", "#34d399", "#f59e0b"][i % 3] }))} />
              </>
            )}
            {rule.id === "capital-trajectory" && (
              <>
                <LineChartCard title="CAR trend vs floor (min + add-on)" data={c.carTrend ?? []} series={[{ key: "car", color: "#f43f5e" }, { key: "cet1", color: "#38bdf8" }]} referenceLines={[{ y: rt.thresholds.carMinimumPct + rt.thresholds.carRiskAddOnPct, label: "floor", color: "#f43f5e" }]} />
                <LineChartCard title="CAR projection (linear, ECL drag incl.)" data={c.projection ?? []} series={[{ key: "projected", color: "#f59e0b" }]} referenceLines={[{ y: c.projection?.[0]?.floor ?? 12.5, label: "floor", color: "#f43f5e" }]} />
                <LineChartCard title="RWA growth QoQ (%)" data={c.rwaGrowth ?? []} series={[{ key: "rwaGrowth", color: "#38bdf8" }]} />
                <div className="card p-4 text-sm text-slate-300">Projected breach horizon: <b className="text-danger">{c.breachHorizonMonths} months</b> (alert threshold {rt.thresholds.capitalBreachHorizonMonths} months)</div>
              </>
            )}
            {rule.id === "funding-erosion" && (
              <>
                <LineChartCard title="Deposit mix (share %)" data={(c.depositMixTrend?.[0]?.series ?? []).map((p: any, i: number) => ({ period: p.period, ...Object.fromEntries((c.depositMixTrend ?? []).map((t: any) => [t.type, t.series[i]?.share])) }))} series={(c.depositMixTrend ?? []).map((t: any, i: number) => ({ key: t.type, color: ["#38bdf8", "#34d399", "#f59e0b"][i % 3] }))} />
                <LineChartCard title="Total deposits (NGN bn) — stable" data={c.depositTotal ?? []} series={[{ key: "total", color: "#38bdf8" }]} />
                <LineChartCard title="Liquidity ratio vs CBN 30%" data={c.liquidityTrend ?? []} series={[{ key: "liquidityRatio", color: "#f59e0b" }]} referenceLines={[{ y: rt.thresholds.liquidityRatioMinimumPct, label: "CBN 30%" }]} />
                <div className="card p-4 text-sm text-slate-300">Classification: <b className="text-warn">{c.classification}</b> (liquidity ratio vs 30% CBN minimum + 5pp buffer)</div>
              </>
            )}
            {rule.id === "concentration-creep" && (
              <>
                <LineChartCard title="Top-10 obligor share vs appetite" data={c.top10Trend ?? []} series={[{ key: "top10", color: "#f59e0b" }]} referenceLines={[{ y: rt.thresholds.top10ObligorAppetitePct, label: "appetite", color: "#f43f5e" }]} />
                <LineChartCard title="Single obligor % of funds vs CBN limit" data={c.singleObligorTrend ?? []} series={[{ key: "singleObligor", color: "#f43f5e" }]} referenceLines={[{ y: rt.thresholds.singleObligorLimitPctOfFunds, label: "20% limit", color: "#f43f5e" }, { y: (rt.thresholds.singleObligorApproachPctOfLimit / 100) * rt.thresholds.singleObligorLimitPctOfFunds, label: "approach", color: "#f59e0b" }]} />
                <BarChartCard title="Sector concentration (%)" data={c.sectorConcentration ?? []} xKey="sector" series={[{ key: "now", color: "#38bdf8" }]} />
                <div className="card p-4 text-sm text-slate-300">Headroom to single-obligor limit: <b>{c.headroomPp} pp</b></div>
              </>
            )}
          </div>

          {latest.claims.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 text-sm font-semibold">Numeric claims (validated against aggregate store)</h3>
              <table className="w-full">
                <thead><tr><th className="th">Claim</th><th className="th">Value</th><th className="th">Measure</th><th className="th">Period</th><th className="th">Verified</th></tr></thead>
                <tbody>
                  {latest.claims.map((cl, i) => (
                    <tr key={i}>
                      <td className="td max-w-md">{cl.text}</td>
                      <td className="td">{cl.value} {cl.unit}</td>
                      <td className="td font-mono text-xs">{cl.measure}</td>
                      <td className="td">{cl.period}</td>
                      <td className="td">{cl.verified ? <span className="badge bg-ok/20 text-ok border border-ok/40">verified</span> : <span className="badge bg-danger/20 text-danger border border-danger/50">removed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Insight history for this playbook</h3>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400">No insights generated yet.</p>
        ) : (
          <table className="w-full">
            <thead><tr><th className="th">Created</th><th className="th">Severity</th><th className="th">Confidence</th><th className="th">Status</th><th className="th">Period</th></tr></thead>
            <tbody>
              {insights.map((i) => (
                <tr key={i.id}>
                  <td className="td">{new Date(i.createdAt).toLocaleString()}</td>
                  <td className="td"><SeverityBadge severity={i.severity} /></td>
                  <td className="td">{(i.confidence * 100).toFixed(0)}%</td>
                  <td className="td">{i.status}{i.assignedTo ? ` → ${i.assignedTo}` : ""}</td>
                  <td className="td">{i.createdPeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
