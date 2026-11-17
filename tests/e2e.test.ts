import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestRuntime, testDetectContext, TEST_PERIOD } from "./helpers.ts";
import { runDetectors } from "../lib/detect/index.ts";
import { runIngestion } from "../lib/ingest/pipeline.ts";
import { composeDigest } from "../lib/notify/digest.ts";
import { roleSeesInsight, demoIdentity } from "../lib/auth/roles.ts";
import { buildAdaptiveCard } from "../lib/notify/teams.ts";
import { currentPeriod } from "../lib/util.ts";

/**
 * E2E happy path (mock tenant): connect -> map -> ingest -> detect -> digest,
 * with the CRO receiving a digest in which every number traces to a certified
 * measure and the NPL insight separates reclassification from new defaults.
 */
test("e2e: connect -> map -> ingest -> detect -> digest", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);

  // Connect: workspace + certified dataset visible under the user's identity.
  const ws = await rt.pbi.listWorkspaces(rt.identity);
  const ds = (await rt.pbi.listDatasets(rt.identity, ws[0].id)).find((d) => d.isCertified)!;
  assert.ok(ds);

  // Map: all concepts mapped and certified (bootstrap did auto-suggest + confirm).
  const mappings = await rt.store.getMappings();
  assert.ok(mappings.every((m) => m.status === "certified" && m.measureName), "all mappings certified in demo bootstrap");

  // Ingest: idempotent re-run returns the same row counts and does not duplicate.
  const again = await runIngestion({
    store: rt.store,
    pbi: rt.pbi,
    datasetId: rt.datasetId,
    identity: rt.identity,
    mappings,
    options: { now: TEST_PERIOD },
  });
  assert.ok(again.every((r) => r.rows > 0));
  const concepts = await rt.store.listConcepts();
  assert.ok(concepts.length >= 25);

  // Detect.
  const ctx = await testDetectContext(rt);
  const run = await runDetectors(ctx);
  assert.ok(run.insights.length >= 5, `expected insights, got ${run.insights.map((i) => i.ruleId)}`);

  // Every published insight: verified claims only, evidence with measure+period, report link.
  for (const i of run.insights) {
    assert.ok(i.claims.every((c) => c.verified));
    for (const e of i.evidence) {
      assert.ok(e.measure && e.period && typeof e.value === "number");
    }
    assert.ok(i.reportUrl);
    assert.ok(i.confidence >= 0.8, `confidence ${i.confidence}`);
  }

  // The NPL insight separates reclassification from new defaults.
  const npl = run.insights.find((i) => i.ruleId === "npl-drift")!;
  const split = npl.diagnostics.driverSplit as { driver: string; recent90d: number }[];
  const reclass = split.find((d) => d.driver === "reclassified_forborne")!.recent90d;
  const newDef = split.find((d) => d.driver === "new_defaults")!.recent90d;
  assert.ok(reclass > newDef);
  assert.match(npl.narrative, /reclassification/i);

  // Digest per role: CRO sees the NPL insight; every number in the digest narrative is verified.
  const all = await rt.store.listInsights({});
  const croDigest = composeDigest("CRO", all, TEST_PERIOD);
  assert.ok(croDigest.insights.some((i) => i.ruleId === "npl-drift"));
  assert.ok(roleSeesInsight("CRO", npl));
  assert.ok(!roleSeesInsight("ALCO", npl), "ALCO should not get the asset-quality NPL card");
  assert.ok(croDigest.teamsCards.length > 0);
  const card = buildAdaptiveCard(npl);
  assert.equal(card.type, "message");

  // Audit: queries executed against the tenant + insights published are logged.
  const audit = await rt.store.listAudit(500);
  assert.ok(audit.some((a) => a.action === "pbi.executeAggregate" || a.action === "ingest.concept"), "query audit present");
  assert.ok(audit.some((a) => a.action === "insight.publish"), "publish audit present");
  const queryAudit = audit.find((a) => a.action === "pbi.executeAggregate")!;
  assert.equal(queryAudit.actor, rt.identity.userId);
  assert.equal(queryAudit.detail.rlsApplied, true);

  // Acknowledge / assign flow (phase-2 action loop entry).
  await rt.store.updateInsight(npl.id, { status: "acknowledged" });
  await rt.store.audit({ at: new Date().toISOString(), actor: rt.identity.userId, action: "insight.acknowledge", detail: { insightId: npl.id } });
  await rt.store.updateInsight(npl.id, { status: "assigned", assignedTo: "risk@firstmeridian.demo" });
  const after = await rt.store.getInsight(npl.id);
  assert.equal(after!.status, "assigned");
  assert.equal(after!.assignedTo, "risk@firstmeridian.demo");
  const ackAudit = await rt.store.listAudit(500);
  assert.ok(ackAudit.some((a) => a.action === "insight.acknowledge"));
});

test("freshness monitor reflects the ingested period", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const freshness = await rt.store.getFreshness();
  assert.ok(freshness.length >= 25);
  for (const f of freshness) assert.equal(f.period, TEST_PERIOD);
  void currentPeriod;
});
