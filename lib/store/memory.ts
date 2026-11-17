import type { AggregateRecord, AuditEntry, Insight, Mapping, Period } from "../types.ts";
import type { AggregateQueryOptions, FreshnessEntry, Repository } from "./repository.ts";
import { deepKey, uid } from "../util.ts";

/** In-memory repository: demo mode and tests. Same contract as the Postgres one. */
export class MemoryRepository implements Repository {
  private aggregates = new Map<string, AggregateRecord>();
  private insights = new Map<string, Insight>();
  private mappings = new Map<string, Mapping>();
  private settings = new Map<string, string>();
  private auditLog: AuditEntry[] = [];
  private freshness = new Map<string, FreshnessEntry>();

  private aggKey(r: AggregateRecord): string {
    return `${r.concept}|${deepKey(r.dimensions)}|${r.period}|${r.sourceMeasure}`;
  }

  async upsertAggregates(rows: AggregateRecord[]): Promise<void> {
    for (const r of rows) this.aggregates.set(this.aggKey(r), { ...r, dimensions: { ...r.dimensions } });
  }

  async queryAggregates(concept: string, opts: AggregateQueryOptions = {}): Promise<AggregateRecord[]> {
    const { from, to, dimensions } = opts;
    let out = [...this.aggregates.values()].filter((r) => r.concept === concept);
    if (from) out = out.filter((r) => r.period >= from);
    if (to) out = out.filter((r) => r.period <= to);
    if (dimensions) {
      out = out.filter((r) => Object.entries(dimensions).every(([k, v]) => r.dimensions[k] === v));
    }
    return out.sort((a, b) => a.period.localeCompare(b.period) || deepKey(a.dimensions).localeCompare(deepKey(b.dimensions)));
  }

  async getSeries(concept: string, dimensions: Record<string, string> = {}, from?: Period, to?: Period): Promise<{ period: Period; value: number }[]> {
    const rows = await this.queryAggregates(concept, { from, to, dimensions });
    return rows.map((r) => ({ period: r.period, value: r.value }));
  }

  async listConcepts(): Promise<string[]> {
    return [...new Set([...this.aggregates.values()].map((r) => r.concept))].sort();
  }

  async saveInsight(insight: Insight): Promise<void> {
    this.insights.set(insight.id, insight);
  }

  async getInsight(id: string): Promise<Insight | null> {
    return this.insights.get(id) ?? null;
  }

  async listInsights(filter: { ruleId?: string; status?: string } = {}): Promise<Insight[]> {
    let out = [...this.insights.values()];
    if (filter.ruleId) out = out.filter((i) => i.ruleId === filter.ruleId);
    if (filter.status) out = out.filter((i) => i.status === filter.status);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateInsight(id: string, patch: Partial<Insight>): Promise<void> {
    const cur = this.insights.get(id);
    if (!cur) throw new Error(`Insight ${id} not found`);
    this.insights.set(id, { ...cur, ...patch });
  }

  async getMappings(): Promise<Mapping[]> {
    return [...this.mappings.values()].sort((a, b) => a.concept.localeCompare(b.concept));
  }

  async getMapping(concept: string): Promise<Mapping | null> {
    return this.mappings.get(concept) ?? null;
  }

  async saveMapping(mapping: Mapping): Promise<void> {
    this.mappings.set(mapping.concept, mapping);
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async audit(entry: Omit<AuditEntry, "id">): Promise<void> {
    this.auditLog.push({ id: uid("audit"), ...entry });
  }

  async listAudit(limit = 200): Promise<AuditEntry[]> {
    return this.auditLog.slice(-limit).reverse();
  }

  async setFreshness(concept: string, period: Period, at: string): Promise<void> {
    this.freshness.set(concept, { concept, period, at });
  }

  async getFreshness(): Promise<FreshnessEntry[]> {
    return [...this.freshness.values()];
  }

  async pruneAggregates(olderThanPeriod: Period): Promise<number> {
    let n = 0;
    for (const [k, r] of this.aggregates) {
      if (r.period < olderThanPeriod) {
        this.aggregates.delete(k);
        n++;
      }
    }
    return n;
  }

  async close(): Promise<void> {}
}
