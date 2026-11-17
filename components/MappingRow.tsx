"use client";

import { useState } from "react";
import type { Mapping } from "../lib/types.ts";
import type { OntologyConcept } from "../lib/ontology/index.ts";
import type { Suggestion } from "../lib/mapping/suggest.ts";
export default function MappingRow({
  concept,
  mapping,
  measures,
  suggestions,
}: {
  concept: OntologyConcept;
  mapping: Mapping | null;
  measures: string[];
  suggestions: Suggestion[];
}) {
  const [measure, setMeasure] = useState(mapping?.measureName ?? suggestions[0]?.measure ?? "");
  const [status, setStatus] = useState(mapping?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save(action?: "certify") {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/mapping/${encodeURIComponent(concept.key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "certify" ? { action: "certify" } : { measureName: measure || null, action: "draft" }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(data.mapping.status);
      setMsg(action === "certify" ? "Certified — feeds production insights." : "Saved as draft.");
    } else {
      const e = await res.json();
      setMsg(e.message ?? "error");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg bg-ink-850 border border-ink-700 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <div className="text-sm font-medium">{concept.label}</div>
          <div className="font-mono text-xs text-slate-500">{concept.key}</div>
        </div>
        <select
          className="flex-1 min-w-56 rounded-lg bg-ink-800 border border-ink-600 px-2 py-1.5 text-sm"
          value={measure}
          onChange={(e) => setMeasure(e.target.value)}
        >
          <option value="">— no measure (gap) —</option>
          {measures.map((m) => (
            <option key={m} value={m}>{m}{suggestions.some((s) => s.measure === m) ? "  ★ suggested" : ""}</option>
          ))}
        </select>
        <span className={`badge border ${status === "certified" ? "bg-ok/20 text-ok border-ok/40" : "bg-warn/20 text-warn border-warn/40"}`}>{status}</span>
        <button className="btn" disabled={busy || !measure} onClick={() => save()}>Save draft</button>
        <button className="btn btn-accent" disabled={busy || !measure} onClick={() => save("certify")}>Certify</button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          Auto-suggest: {suggestions.slice(0, 3).map((s) => `${s.measure} (${(s.score * 100).toFixed(0)}%)`).join(" · ")}
        </div>
      )}
      {!measure && concept.daxGapTemplate && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-warn">Suggested DAX to create this measure</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-ink-950 p-2 font-mono text-xs text-slate-300">{concept.daxGapTemplate}</pre>
        </details>
      )}
      {msg && <div className="mt-1 text-xs text-accent">{msg}</div>}
    </div>
  );
}
