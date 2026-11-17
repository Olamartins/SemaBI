import type { DetectContext, EffectiveIdentity } from "../types.ts";
import { createRepository } from "../store/index.ts";
import type { Repository } from "../store/index.ts";
import { createPbiClient, isDemoMode } from "../pbi/index.ts";
import type { PbiClient } from "../pbi/index.ts";
import { loadRuleParameters } from "../ontology/thresholds.ts";
import { ALL_CONCEPTS } from "../ontology/index.ts";
import { initMappings, certifyMapping } from "../mapping/store.ts";
import { gapRemediation, coverage } from "../mapping/gaps.ts";
import { runIngestion } from "../ingest/pipeline.ts";
import { runDetectors } from "../detect/index.ts";
import { demoIdentity } from "../auth/roles.ts";
import { currentPeriod } from "../util.ts";

export interface Runtime {
  store: Repository;
  pbi: PbiClient;
  datasetId: string;
  workspaceId: string;
  thresholds: ReturnType<typeof loadRuleParameters>;
  identity: EffectiveIdentity;
  bootstrapped: boolean;
  lastIngestAt?: string;
  lastDetectAt?: string;
}

let runtime: Runtime | null = null;

async function audit(store: Repository, actor: string) {
  return async (action: string, detail: Record<string, unknown>) => {
    await store.audit({ at: new Date().toISOString(), actor, action, detail });
  };
}

/** Singleton app runtime. In demo mode everything runs in-process against the mock tenant. */
export async function getRuntime(opts: { forceIdentity?: EffectiveIdentity; endPeriod?: string } = {}): Promise<Runtime> {
  if (runtime && !opts.endPeriod) return runtime;
  const store = createRepository();
  const auditFn = await audit(store, opts.forceIdentity?.userId ?? demoIdentity().userId);
  const pbi = createPbiClient({
    endPeriod: opts.endPeriod,
    audit: (e) => {
      void store.audit({ at: new Date().toISOString(), actor: e.actor, action: e.action, detail: e.detail });
    },
  });
  const thresholds = loadRuleParameters();
  const identity = opts.forceIdentity ?? demoIdentity();
  const ws = (await pbi.listWorkspaces(identity))[0];
  const ds = (await pbi.listDatasets(identity, ws.id)).find((d) => d.isCertified) ?? (await pbi.listDatasets(identity, ws.id))[0];
  runtime = {
    store,
    pbi,
    datasetId: ds.id,
    workspaceId: ws.id,
    thresholds,
    identity,
    bootstrapped: false,
  };
  await ensureBootstrapped(runtime);
  return runtime;
}

/** Idempotent demo bootstrap: metadata -> auto-mapped ontology -> certify -> ingest -> detect. */
export async function ensureBootstrapped(rt: Runtime): Promise<void> {
  if (rt.bootstrapped) return;
  const metadata = await rt.pbi.getMetadata(rt.identity, rt.datasetId);
  const mappings = await initMappings(rt.store, metadata);
  // In demo mode the BI admin's confirmations are pre-applied: certify all mapped concepts.
  for (const m of mappings) {
    if (m.measureName) await certifyMapping(rt.store, m.concept, "biadmin@firstmeridian.demo");
  }
  const auditFn = await audit(rt.store, rt.identity.userId);
  const freshMappings = await rt.store.getMappings();
  await runIngestion({
    store: rt.store,
    pbi: rt.pbi,
    datasetId: rt.datasetId,
    identity: rt.identity,
    mappings: freshMappings,
    audit: auditFn,
  });
  rt.lastIngestAt = new Date().toISOString();
  const ctx = await detectContextAsync(rt);
  await runDetectors(ctx);
  rt.lastDetectAt = new Date().toISOString();
  await auditFn("demo.bootstrap", { concepts: ALL_CONCEPTS.length, dataset: rt.datasetId, mode: isDemoMode() ? "demo" : "prod" });
  rt.bootstrapped = true;
}

export function detectContext(rt: Runtime, now: string = currentPeriod()): DetectContext {
  return {
    store: rt.store,
    mappings: [], // refreshed per-run below
    thresholds: rt.thresholds,
    now,
    pbi: rt.pbi,
    datasetId: rt.datasetId,
    identity: rt.identity,
    audit: async (action, detail) => {
      await rt.store.audit({ at: new Date().toISOString(), actor: rt.identity.userId, action, detail });
    },
  };
}

/** DetectContext with mappings loaded (async because store may be remote). */
export async function detectContextAsync(rt: Runtime, now: string = currentPeriod()): Promise<DetectContext> {
  const ctx = detectContext(rt, now);
  ctx.mappings = await rt.store.getMappings();
  return ctx;
}

export async function mappingCoverage(rt: Runtime) {
  const mappings = await rt.store.getMappings();
  const metadata = await rt.pbi.getMetadata(rt.identity, rt.datasetId);
  return {
    coverage: coverage(mappings, ALL_CONCEPTS),
    gaps: ALL_CONCEPTS.filter((c) => !mappings.find((m) => m.concept === c.key)?.measureName).map((c) => gapRemediation(c.key, metadata, mappings.find((m) => m.concept === c.key) ?? null)),
  };
}

// Allow tests to reset the singleton.
export function resetRuntime(): void {
  runtime = null;
}
