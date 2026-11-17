import type { AggregateRecord, AuditEntry, Insight, Mapping, Period } from "../types.ts";
import type { AggregateQueryOptions, FreshnessEntry, Repository } from "./repository.ts";
import { deepKey, uid } from "../util.ts";

/**
 * PostgreSQL repository (prod). Uses the `pg` driver lazily so the demo/test path
 * never needs the dependency loaded. Schema: db/migrations/001_init.sql.
 */
export class PostgresRepository implements Repository {
  private poolPromise: Promise<import("pg").Pool> | null = null;

  private async pool(): Promise<import("pg").Pool> {
    if (!this.poolPromise) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is required for the Postgres repository");
      this.poolPromise = import("pg").then(({ Pool }) => new Pool({ connectionString: url, max: 10 }));
    }
    return this.poolPromise;
  }

  async upsertAggregates(rows: AggregateRecord[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = await this.pool();
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      const b = i * 7;
      values.push(r.concept, JSON.stringify(r.dimensions), r.period, r.value, r.unit, r.sourceMeasure, r.ingestedAt);
      return `($${b + 1}, $${b + 2}::jsonb, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
    });
    await pool.query(
      `INSERT INTO aggregates (concept, dimensions, period, value, unit, source_measure, ingested_at)
       VALUES ${tuples.join(",")}
       ON CONFLICT (concept, dimensions, period, source_measure) DO UPDATE
       SET value = EXCLUDED.value, unit = EXCLUDED.unit, ingested_at = EXCLUDED.ingested_at`,
      values,
    );
  }

  async queryAggregates(concept: string, opts: AggregateQueryOptions = {}): Promise<AggregateRecord[]> {
    const pool = await this.pool();
    const conds = ["concept = $1"];
    const values: unknown[] = [concept];
    if (opts.from) {
      values.push(opts.from);
      conds.push(`period >= $${values.length}`);
    }
    if (opts.to) {
      values.push(opts.to);
      conds.push(`period <= $${values.length}`);
    }
    if (opts.dimensions) {
      for (const [k, v] of Object.entries(opts.dimensions)) {
        values.push(k, v);
        conds.push(`dimensions->>$${values.length - 1} = $${values.length}`);
      }
    }
    const res = await pool.query(
      `SELECT concept, dimensions, period, value, unit, source_measure, ingested_at
       FROM aggregates WHERE ${conds.join(" AND ")} ORDER BY period, dimensions`,
      values,
    );
    return res.rows.map((r) => ({
      concept: r.concept,
      dimensions: r.dimensions,
      period: r.period,
      value: Number(r.value),
      unit: r.unit,
      sourceMeasure: r.source_measure,
      ingestedAt: r.ingested_at.toISOString(),
    }));
  }

  async getSeries(concept: string, dimensions: Record<string, string> = {}, from?: Period, to?: Period) {
    const rows = await this.queryAggregates(concept, { from, to, dimensions });
    return rows.map((r) => ({ period: r.period, value: r.value }));
  }

  async listConcepts(): Promise<string[]> {
    const pool = await this.pool();
    const res = await pool.query("SELECT DISTINCT concept FROM aggregates ORDER BY concept");
    return res.rows.map((r) => r.concept);
  }

  async saveInsight(insight: Insight): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `INSERT INTO insights (id, rule_id, domain, severity, title, narrative, claims, evidence, owner, route_to, confidence, status, assigned_to, created_period, created_at, report_url, diagnostics)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, assigned_to = EXCLUDED.assigned_to, narrative = EXCLUDED.narrative`,
      [insight.id, insight.ruleId, insight.domain, insight.severity, insight.title, insight.narrative, JSON.stringify(insight.claims), JSON.stringify(insight.evidence), insight.owner, JSON.stringify(insight.routeTo), insight.confidence, insight.status, insight.assignedTo ?? null, insight.createdPeriod, insight.createdAt, insight.reportUrl ?? null, JSON.stringify(insight.diagnostics)],
    );
  }

  private rowToInsight(r: Record<string, unknown>): Insight {
    return {
      id: r.id as string,
      ruleId: r.rule_id as string,
      domain: r.domain as string,
      severity: r.severity as Insight["severity"],
      title: r.title as string,
      narrative: r.narrative as string,
      claims: r.claims as Insight["claims"],
      evidence: r.evidence as Insight["evidence"],
      owner: r.owner as string,
      routeTo: r.route_to as Insight["routeTo"],
      confidence: Number(r.confidence),
      status: r.status as Insight["status"],
      assignedTo: (r.assigned_to as string) ?? undefined,
      createdPeriod: r.created_period as Period,
      createdAt: (r.created_at as Date).toISOString(),
      reportUrl: (r.report_url as string) ?? undefined,
      diagnostics: r.diagnostics as Record<string, unknown>,
    };
  }

  async getInsight(id: string): Promise<Insight | null> {
    const pool = await this.pool();
    const res = await pool.query("SELECT * FROM insights WHERE id = $1", [id]);
    return res.rows.length ? this.rowToInsight(res.rows[0]) : null;
  }

  async listInsights(filter: { ruleId?: string; status?: string } = {}): Promise<Insight[]> {
    const pool = await this.pool();
    const conds: string[] = [];
    const values: unknown[] = [];
    if (filter.ruleId) {
      values.push(filter.ruleId);
      conds.push(`rule_id = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      conds.push(`status = $${values.length}`);
    }
    const res = await pool.query(`SELECT * FROM insights ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY created_at DESC`, values);
    return res.rows.map((r) => this.rowToInsight(r));
  }

  async updateInsight(id: string, patch: Partial<Insight>): Promise<void> {
    const pool = await this.pool();
    const sets: string[] = [];
    const values: unknown[] = [];
    const fields: [string, unknown][] = [
      ["status", patch.status],
      ["assigned_to", patch.assignedTo],
      ["narrative", patch.narrative],
      ["severity", patch.severity],
    ];
    for (const [col, v] of fields) {
      if (v !== undefined) {
        values.push(v);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (sets.length === 0) return;
    values.push(id);
    await pool.query(`UPDATE insights SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  }

  async getMappings(): Promise<Mapping[]> {
    const pool = await this.pool();
    const res = await pool.query("SELECT * FROM mappings ORDER BY concept");
    return res.rows.map((r) => this.rowToMapping(r));
  }

  async getMapping(concept: string): Promise<Mapping | null> {
    const pool = await this.pool();
    const res = await pool.query("SELECT * FROM mappings WHERE concept = $1", [concept]);
    return res.rows.length ? this.rowToMapping(res.rows[0]) : null;
  }

  private rowToMapping(r: Record<string, unknown>): Mapping {
    return {
      concept: r.concept as string,
      status: r.status as Mapping["status"],
      measureName: (r.measure_name as string) ?? null,
      daxExpression: (r.dax_expression as string) ?? null,
      dimensions: r.dimensions as Record<string, string>,
      autoSuggested: r.auto_suggested as boolean,
      certifiedBy: (r.certified_by as string) ?? undefined,
      certifiedAt: r.certified_at ? (r.certified_at as Date).toISOString() : undefined,
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }

  async saveMapping(m: Mapping): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      `INSERT INTO mappings (concept, status, measure_name, dax_expression, dimensions, auto_suggested, certified_by, certified_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       ON CONFLICT (concept) DO UPDATE SET status = EXCLUDED.status, measure_name = EXCLUDED.measure_name,
         dax_expression = EXCLUDED.dax_expression, dimensions = EXCLUDED.dimensions, auto_suggested = EXCLUDED.auto_suggested,
         certified_by = EXCLUDED.certified_by, certified_at = EXCLUDED.certified_at, updated_at = EXCLUDED.updated_at`,
      [m.concept, m.status, m.measureName, m.daxExpression, JSON.stringify(m.dimensions), m.autoSuggested, m.certifiedBy ?? null, m.certifiedAt ?? null, m.updatedAt],
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const pool = await this.pool();
    const res = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
    return res.rows.length ? (res.rows[0].value as string) : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const pool = await this.pool();
    await pool.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]);
  }

  async audit(entry: Omit<AuditEntry, "id">): Promise<void> {
    const pool = await this.pool();
    await pool.query("INSERT INTO audit_log (id, at, actor, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)", [uid("audit"), entry.at, entry.actor, entry.action, JSON.stringify(entry.detail)]);
  }

  async listAudit(limit = 200): Promise<AuditEntry[]> {
    const pool = await this.pool();
    const res = await pool.query("SELECT * FROM audit_log ORDER BY at DESC LIMIT $1", [limit]);
    return res.rows.map((r) => ({ id: r.id, at: (r.at as Date).toISOString(), actor: r.actor, action: r.action, detail: r.detail }));
  }

  async setFreshness(concept: string, period: Period, at: string): Promise<void> {
    const pool = await this.pool();
    await pool.query(
      "INSERT INTO freshness (concept, period, at) VALUES ($1, $2, $3) ON CONFLICT (concept) DO UPDATE SET period = EXCLUDED.period, at = EXCLUDED.at",
      [concept, period, at],
    );
  }

  async getFreshness(): Promise<FreshnessEntry[]> {
    const pool = await this.pool();
    const res = await pool.query("SELECT concept, period, at FROM freshness");
    return res.rows.map((r) => ({ concept: r.concept, period: r.period, at: (r.at as Date).toISOString() }));
  }

  async pruneAggregates(olderThanPeriod: Period): Promise<number> {
    const pool = await this.pool();
    const res = await pool.query("DELETE FROM aggregates WHERE period < $1", [olderThanPeriod]);
    return res.rowCount ?? 0;
  }

  async close(): Promise<void> {
    if (this.poolPromise) {
      const pool = await this.poolPromise;
      await pool.end();
      this.poolPromise = null;
    }
  }
}

export { deepKey };
