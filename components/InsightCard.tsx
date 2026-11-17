"use client";

import { useState } from "react";
import type { Insight } from "../lib/types.ts";
import SeverityBadge from "./SeverityBadge.tsx";

export default function InsightCard({ insight, owners }: { insight: Insight; owners: string[] }) {
  const [status, setStatus] = useState(insight.status);
  const [assignedTo, setAssignedTo] = useState(insight.assignedTo ?? "");
  const [busy, setBusy] = useState(false);

  async function ack() {
    setBusy(true);
    const res = await fetch(`/api/insights/${insight.id}/acknowledge`, { method: "POST" });
    if (res.ok) setStatus("acknowledged");
    setBusy(false);
  }

  async function assign(to: string) {
    if (!to) return;
    setBusy(true);
    const res = await fetch(`/api/insights/${insight.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo: to }),
    });
    if (res.ok) {
      setStatus("assigned");
      setAssignedTo(to);
    }
    setBusy(false);
  }

  return (
    <article className="card p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={insight.severity} />
        <span className="badge bg-ink-700 text-slate-300">{insight.domain}</span>
        <span className="badge bg-ink-700 text-slate-300">{insight.ruleId}</span>
        <span className="badge bg-ink-700 text-slate-300">confidence {(insight.confidence * 100).toFixed(0)}%</span>
        <span className="badge bg-ink-700 text-slate-300">period {insight.createdPeriod}</span>
        <span className="ml-auto text-xs text-slate-500">{new Date(insight.createdAt).toLocaleString()}</span>
      </div>
      <h3 className="text-lg font-semibold">{insight.title}</h3>
      <p className="text-sm leading-relaxed text-slate-300">{insight.narrative}</p>
      {insight.evidence.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {insight.evidence.map((e, i) => (
            <span key={i} className="rounded-md bg-ink-800 px-2 py-1 text-slate-300" title={`${e.measure} @ ${e.period}`}>
              {e.label}: <b>{e.value}{e.unit ? ` ${e.unit}` : ""}</b> ({e.period})
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3 text-sm">
        <span className="text-slate-400">Owner: <b className="text-slate-200">{insight.owner}</b></span>
        <span className="text-slate-400">Route: {insight.routeTo.join(", ")}</span>
        {insight.reportUrl && (
          <a className="btn" href={insight.reportUrl} target="_blank" rel="noreferrer">Drill down in Power BI</a>
        )}
        <a className="btn" href={`/playbooks/${insight.ruleId}`}>Playbook</a>
        <button className="btn btn-accent" disabled={busy || status !== "new"} onClick={ack}>
          {status === "acknowledged" || status === "assigned" ? "Acknowledged" : "Acknowledge"}
        </button>
        <select
          className="rounded-lg bg-ink-800 border border-ink-600 px-2 py-1.5 text-sm"
          value={assignedTo}
          disabled={busy}
          onChange={(e) => assign(e.target.value)}
        >
          <option value="">Assign to…</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {status === "assigned" && <span className="badge bg-ok/20 text-ok border border-ok/40">assigned to {assignedTo}</span>}
      </div>
    </article>
  );
}
