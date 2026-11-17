import type { AggregateQuery, DetectContext, EffectiveIdentity, Mapping, PbiClient, Period } from "../types.ts";
import type { Repository } from "../store/repository.ts";
import { conceptByKey } from "../ontology/index.ts";
import { addMonths, currentPeriod, deepKey } from "../util.ts";

export interface IngestResult {
  concept: string;
  rows: number;
  from: Period;
  to: Period;
  idempotentKey: string;
}

export interface IngestOptions {
  months?: number; // lookback window for aggregates (default 24, matches retention)
  now?: Period;
}

/**
 * Nightly extraction of KPI aggregates from the certified semantic model into the
 * app's own store. Aggregate-only: the DAX queries are SUMMARIZE aggregates; row-level
 * customer data is never requested or persisted. Every query runs under an effective
 * identity (RLS enforced by the tenant). Idempotent: upsert keyed by
 * (concept, dimensions, period, sourceMeasure), safe to re-run.
 */
export async function runIngestion(opts: {
  store: Repository;
  pbi: PbiClient;
  datasetId: string;
  identity: EffectiveIdentity;
  mappings: Mapping[];
  options?: IngestOptions;
  audit?: (action: string, detail: Record<string, unknown>) => Promise<void>;
}): Promise<IngestResult[]> {
  const { store, pbi, datasetId, identity, mappings } = opts;
  const now = opts.options?.now ?? currentPeriod();
  const months = opts.options?.months ?? 24;
  const from = addMonths(now, -(months - 1));
  const results: IngestResult[] = [];

  const certified = mappings.filter((m) => m.status === "certified" && m.measureName);
  for (const mapping of certified) {
    const concept = conceptByKey(mapping.concept);
    if (!concept) continue;
    const groupBy = Object.values(mapping.dimensions);
    const query: AggregateQuery = {
      measure: mapping.measureName!,
      concept: mapping.concept,
      from,
      to: now,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
    };
    // Effective identity is mandatory — the PBI client fails closed without one.
    const rows = await pbi.executeAggregate(identity, datasetId, query);
    await store.upsertAggregates(rows);
    await store.setFreshness(mapping.concept, now, new Date().toISOString());
    await opts.audit?.("ingest.concept", {
      concept: mapping.concept,
      measure: mapping.measureName,
      rows: rows.length,
      from,
      to: now,
      identity: identity.userId,
      rlsDelegatedToTenant: true,
    });
    results.push({
      concept: mapping.concept,
      rows: rows.length,
      from,
      to: now,
      idempotentKey: `${mapping.concept}|${deepKey(mapping.dimensions)}|${from}|${now}`,
    });
  }

  // Retention: aggregates only, 24 months by default (configurable).
  const retentionMonths = Number(process.env.AGGREGATE_RETENTION_MONTHS ?? 24);
  const cutoff = addMonths(now, -retentionMonths);
  const pruned = await store.pruneAggregates(cutoff);
  await opts.audit?.("ingest.prune", { olderThan: cutoff, rowsRemoved: pruned, retentionMonths });
  return results;
}

/** Convenience wrapper used by API routes / scheduler / demo bootstrap. */
export async function ingestAll(ctx: Pick<DetectContext, "store" | "pbi" | "identity" | "datasetId" | "mappings" | "audit">, options?: IngestOptions) {
  return runIngestion({ ...ctx, options });
}
