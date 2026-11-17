import type { DetectContext, EffectiveIdentity } from "../lib/types.ts";
import { MemoryRepository } from "../lib/store/memory.ts";
import { MockPowerBiClient } from "../lib/pbi/mock.ts";
import { loadRuleParameters } from "../lib/ontology/thresholds.ts";
import { initMappings, certifyMapping } from "../lib/mapping/store.ts";
import { runIngestion } from "../lib/ingest/pipeline.ts";
import { demoIdentity } from "../lib/auth/roles.ts";

export const TEST_PERIOD = "2026-03";

export interface TestRuntime {
  store: MemoryRepository;
  pbi: MockPowerBiClient;
  identity: EffectiveIdentity;
  datasetId: string;
  workspaceId: string;
  thresholds: ReturnType<typeof loadRuleParameters>;
}

/** Full demo stack against the mocked tenant, pinned to a fixed end period for determinism. */
export async function buildTestRuntime(endPeriod: string = TEST_PERIOD): Promise<TestRuntime> {
  const store = new MemoryRepository();
  const auditEntries: { actor: string; action: string; detail: Record<string, unknown> }[] = [];
  const pbi = new MockPowerBiClient(endPeriod, (e) => {
    auditEntries.push(e);
    void store.audit({ at: new Date().toISOString(), actor: e.actor, action: e.action, detail: e.detail });
  });
  const identity = demoIdentity("cro@firstmeridian.demo");
  const thresholds = loadRuleParameters();
  const ws = (await pbi.listWorkspaces(identity))[0];
  const datasets = await pbi.listDatasets(identity, ws.id);
  const datasetId = datasets.find((d) => d.isCertified)!.id;
  const metadata = await pbi.getMetadata(identity, datasetId);
  const mappings = await initMappings(store, metadata);
  for (const m of mappings) {
    if (m.measureName) await certifyMapping(store, m.concept, "biadmin@firstmeridian.demo");
  }
  const audit = async (action: string, detail: Record<string, unknown>) => {
    await store.audit({ at: new Date().toISOString(), actor: identity.userId, action, detail });
  };
  await runIngestion({ store, pbi, datasetId, identity, mappings: await store.getMappings(), options: { now: endPeriod }, audit });
  return { store, pbi, identity, datasetId, workspaceId: ws.id, thresholds, ...{ auditEntries } };
}

export async function testDetectContext(rt: TestRuntime, now: string = TEST_PERIOD): Promise<DetectContext> {
  return {
    store: rt.store,
    mappings: await rt.store.getMappings(),
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
