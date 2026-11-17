import type {
  AggregateQuery,
  AggregateRecord,
  EffectiveIdentity,
  PbiClient,
  PbiDataset,
  PbiReport,
  SemanticModelMetadata,
  Workspace,
} from "../types.ts";
import { requireIdentity } from "./identity.ts";

const PBI_API = "https://api.powerbi.com/v1.0/myorg";
const GRAPH_SCOPE = "https://analysis.windows.net/powerbi/api/.default";

interface TokenProvider {
  getToken(identity: EffectiveIdentity): Promise<string>;
}

/** Service-principal token via MSAL confidential client (tenant app registration). */
export class ServicePrincipalTokenProvider implements TokenProvider {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;

  constructor(clientId: string, clientSecret: string, tenantId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
  }

  async getToken(_identity: EffectiveIdentity): Promise<string> {
    const { ConfidentialClientApplication } = await import("@azure/msal-node");
    const app = new ConfidentialClientApplication({
      auth: { clientId: this.clientId, clientSecret: this.clientSecret, authority: `https://login.microsoftonline.com/${this.tenantId}` },
    });
    const res = await app.acquireTokenByClientCredential({ scopes: [GRAPH_SCOPE] });
    if (!res?.accessToken) throw new Error("MSAL: failed to acquire Power BI token (service principal)");
    return res.accessToken;
  }
}

/** Delegated user token via MSAL on-behalf-of flow (caller supplies the user's token). */
export class OnBehalfOfTokenProvider implements TokenProvider {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private userAssertion: string;

  constructor(clientId: string, clientSecret: string, tenantId: string, userAssertion: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
    this.userAssertion = userAssertion;
  }

  async getToken(_identity: EffectiveIdentity): Promise<string> {
    const { ConfidentialClientApplication } = await import("@azure/msal-node");
    const app = new ConfidentialClientApplication({
      auth: { clientId: this.clientId, clientSecret: this.clientSecret, authority: `https://login.microsoftonline.com/${this.tenantId}` },
    });
    const res = await app.acquireTokenOnBehalfOf({ scopes: [GRAPH_SCOPE], oboAssertion: this.userAssertion });
    if (!res?.accessToken) throw new Error("MSAL: OBO token acquisition failed");
    return res.accessToken;
  }
}

/**
 * Real Power BI REST client. Uses only official, documented endpoints:
 *  - GET /groups, /groups/{id}/datasets, /groups/{id}/reports
 *  - GET /admin/datasets/{id} (dataset scanner metadata: tables/columns/measures/relationships)
 *  - POST /groups/{gid}/datasets/{did}/ExecuteQueries (XMLA-style DAX, supports
 *    impersonatedUserName so RLS is applied by the service under the effective identity)
 * Every method requires an effective identity; without one it fails closed.
 */
export class PowerBiRestClient implements PbiClient {
  readonly mode = "powerbi" as const;
  private tokens: TokenProvider;
  private audit?: (entry: { actor: string; action: string; detail: Record<string, unknown> }) => void;

  constructor(tokens: TokenProvider, audit?: (entry: { actor: string; action: string; detail: Record<string, unknown> }) => void) {
    this.tokens = tokens;
    this.audit = audit;
  }

  private async call<T>(identity: EffectiveIdentity, action: string, path: string, init?: RequestInit, body?: unknown): Promise<T> {
    requireIdentity(identity); // RLS guard: no identity, no query.
    const token = await this.tokens.getToken(identity);
    this.audit?.({ actor: identity.userId, action, detail: { path, mode: identity.mode, rls: identity.rls } });
    const res = await fetch(`${PBI_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Power BI API ${action} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async listWorkspaces(identity: EffectiveIdentity): Promise<Workspace[]> {
    const data = await this.call<{ value: { id: string; name: string }[] }>(identity, "pbi.listWorkspaces", "/groups");
    return data.value.map((g) => ({ id: g.id, name: g.name }));
  }

  async listDatasets(identity: EffectiveIdentity, workspaceId: string): Promise<PbiDataset[]> {
    const data = await this.call<{ value: { id: string; name: string; isCertified?: boolean; configuredRefresh?: { time: string } }[] }>(
      identity,
      "pbi.listDatasets",
      `/groups/${workspaceId}/datasets`,
    );
    return data.value.map((d) => ({
      id: d.id,
      name: d.name,
      workspaceId,
      isCertified: d.isCertified === true,
    }));
  }

  async listReports(identity: EffectiveIdentity, workspaceId: string): Promise<PbiReport[]> {
    const data = await this.call<{ value: { id: string; name: string; datasetId: string; webUrl: string }[] }>(
      identity,
      "pbi.listReports",
      `/groups/${workspaceId}/reports`,
    );
    return data.value.map((r) => ({ id: r.id, name: r.name, datasetId: r.datasetId, webUrl: r.webUrl }));
  }

  async getMetadata(identity: EffectiveIdentity, datasetId: string): Promise<SemanticModelMetadata> {
    // Dataset scanner API (official admin REST endpoint) returns schema + DAX of measures.
    const data = await this.call<{
      tables?: { name: string; columns?: { name: string; dataType: string }[] }[];
      measures?: { name: string; expression: string; description?: string }[];
      relationships?: { name: string; fromTable: string; fromColumn: string; toTable: string; toColumn: string }[];
    }>(identity, "pbi.getMetadata", `/admin/datasets/${datasetId}`);
    return {
      datasetId,
      tables: (data.tables ?? []).map((t) => ({ name: t.name, columns: t.columns ?? [] })),
      measures: (data.measures ?? []).map((m) => ({ name: m.name, dax: m.expression, description: m.description })),
      relationships: (data.relationships ?? []).map((r) => ({
        fromTable: r.fromTable,
        fromColumn: r.fromColumn,
        toTable: r.toTable,
        toColumn: r.toColumn,
      })),
    };
  }

  async executeAggregate(identity: EffectiveIdentity, datasetId: string, query: AggregateQuery): Promise<AggregateRecord[]> {
    requireIdentity(identity);
    const workspaceId = await this.resolveWorkspaceId(identity, datasetId);
    const dax = buildDaxAggregate(query);
    // RLS: with a service principal, the service applies RLS for impersonatedUserName.
    // With delegated auth the user's own token is used, so the tenant applies their RLS.
    const body: Record<string, unknown> = {
      queries: [{ query: dax }],
      serializerSettings: { includeNulls: true },
    };
    if (identity.mode === "service-principal") {
      body.impersonatedUserName = identity.userId;
    }
    const data = await this.call<{
      results: { tables: { rows: Record<string, unknown>[] }[] }[];
    }>(identity, "pbi.executeAggregate", `/groups/${workspaceId}/datasets/${datasetId}/ExecuteQueries`, { method: "POST" }, body);
    const rows = data.results?.[0]?.tables?.[0]?.rows ?? [];
    const dimKeys = query.groupBy ?? [];
    return rows.map((r) => {
      const dimensions: Record<string, string> = {};
      for (const k of dimKeys) dimensions[k] = String(r[k] ?? "");
      const period = String(r["Period"] ?? r["Month"] ?? "");
      return {
        concept: query.concept,
        dimensions,
        period,
        value: Number(r["Value"] ?? 0),
        unit: String(r["Unit"] ?? "%"),
        sourceMeasure: query.measure,
        ingestedAt: new Date().toISOString(),
      } as AggregateRecord;
    });
  }

  getReportUrl(_datasetId: string, reportId?: string): string {
    return reportId ? `https://app.powerbi.com/reports/${reportId}` : "https://app.powerbi.com";
  }

  private async resolveWorkspaceId(identity: EffectiveIdentity, datasetId: string): Promise<string> {
    const workspaces = await this.listWorkspaces(identity);
    for (const ws of workspaces) {
      const ds = await this.listDatasets(identity, ws.id);
      if (ds.some((d) => d.id === datasetId)) return ws.id;
    }
    throw new Error(`Dataset ${datasetId} not found in any accessible workspace`);
  }
}

/** Build a summarized aggregate DAX query (EVALUATE + SUMMARIZE) for an aggregate pull. */
export function buildDaxAggregate(query: AggregateQuery): string {
  const dims = (query.groupBy ?? []).map((c) => `VALUES(${c.includes("[") ? c : `Table[${c}]`})`).join(", ");
  const summarize = `SUMMARIZE(${["VALUES(Period[Month])", dims].filter(Boolean).join(", ")}, "Value", [${query.measure}])`;
  const filter = query.from && query.to
    ? `FILTER(${summarize}, Period[Month] >= "${query.from}" && Period[Month] <= "${query.to}")`
    : summarize;
  return `EVALUATE ${filter}`;
}
