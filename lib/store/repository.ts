import type { AggregateRecord, AuditEntry, Insight, Mapping, Period } from "../types.ts";
export interface AggregateQueryOptions {
  from?: Period;
  to?: Period;
  dimensions?: Record<string, string>; // subset match
}

export interface FreshnessEntry {
  concept: string;
  period: Period;
  at: string;
}

/**
 * App-owned store. Persists metadata, mappings, aggregates, insights, audit —
 * never row-level customer data.
 */
export interface Repository {
  upsertAggregates(rows: AggregateRecord[]): Promise<void>;
  queryAggregates(concept: string, opts?: AggregateQueryOptions): Promise<AggregateRecord[]>;
  getSeries(concept: string, dimensions?: Record<string, string>, from?: Period, to?: Period): Promise<{ period: Period; value: number }[]>;
  listConcepts(): Promise<string[]>;

  saveInsight(insight: Insight): Promise<void>;
  getInsight(id: string): Promise<Insight | null>;
  listInsights(filter?: { ruleId?: string; status?: string; role?: string }): Promise<Insight[]>;
  updateInsight(id: string, patch: Partial<Insight>): Promise<void>;

  getMappings(): Promise<Mapping[]>;
  getMapping(concept: string): Promise<Mapping | null>;
  saveMapping(mapping: Mapping): Promise<void>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  audit(entry: Omit<AuditEntry, "id">): Promise<void>;
  listAudit(limit?: number): Promise<AuditEntry[]>;

  setFreshness(concept: string, period: Period, at: string): Promise<void>;
  getFreshness(): Promise<FreshnessEntry[]>;

  /** Delete aggregates older than retentionMonths (aggregate retention, e.g. 24 months). */
  pruneAggregates(olderThanPeriod: Period): Promise<number>;

  close(): Promise<void>;
}
