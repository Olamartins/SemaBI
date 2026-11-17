import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestRuntime, testDetectContext, TEST_PERIOD } from "./helpers.ts";
import { runDetectors, RULES } from "../lib/detect/index.ts";
import { nplDriftRule } from "../lib/detect/rules/npl-drift.ts";

test("all six v1 detectors are registered", () => {
  assert.deepEqual(
    RULES.map((r) => r.id).sort(),
    ["capital-trajectory", "concentration-creep", "funding-erosion", "nim-compression", "npl-drift", "stage2-leading"],
  );
});

test("detection run on the seed bank triggers all six playbooks", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  const result = await runDetectors(ctx);
  const ids = result.insights.map((i) => i.ruleId).sort();
  assert.deepEqual(ids, ["capital-trajectory", "concentration-creep", "funding-erosion", "nim-compression", "npl-drift", "stage2-leading"]);
  for (const i of result.insights) {
    assert.ok(i.confidence > 0.5, `${i.ruleId} confidence ${i.confidence} should reflect certified mappings + fresh data`);
    assert.ok(i.narrative.length > 20, `${i.ruleId} narrative should be non-trivial`);
    assert.ok(i.claims.every((c) => c.verified), `${i.ruleId} published claims must all be verified`);
    assert.ok(i.evidence.length > 0, `${i.ruleId} must carry evidence links`);
    assert.ok(i.reportUrl?.includes("powerbi.com"), "insight links to source report");
  }
});

test("NPL drift insight separates reclassification noise from genuine new defaults", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  const trigger = await nplDriftRule.trigger(ctx);
  assert.ok(trigger, "NPL rule should trigger on seed data");
  assert.equal(trigger!.severity, "critical"); // breach + >=1pp rise
  const diag = await nplDriftRule.diagnose(ctx, trigger!);
  const split = diag.charts.driverSplit as { driver: string; recent90d: number }[];
  const reclass = split.find((d) => d.driver === "reclassified_forborne")!;
  const newDef = split.find((d) => d.driver === "new_defaults")!;
  assert.ok(reclass.recent90d > newDef.recent90d, "reclassification contribution must exceed new defaults");
  assert.ok((diag.charts.reclassificationShareOfMove as number) > 0.3);
  assert.ok((diag.charts.segmentDecomp as unknown[]).length >= 5, "segment decomposition covers all segments");
  assert.equal(diag.routing.owner, "CRO Office");
  assert.ok(diag.routing.routeTo.includes("CRO"));
});

test("capital trajectory projects a breach horizon under 18 months", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  const result = await runDetectors(ctx);
  const cap = result.insights.find((i) => i.ruleId === "capital-trajectory")!;
  assert.ok(cap);
  const horizon = cap.diagnostics.breachHorizonMonths as number;
  assert.ok(horizon < rt.thresholds.capitalBreachHorizonMonths, `horizon ${horizon} < ${rt.thresholds.capitalBreachHorizonMonths}`);
  assert.ok(cap.routeTo.includes("CFO"));
});

test("funding erosion is classified using the liquidity ratio", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  const result = await runDetectors(ctx);
  const fe = result.insights.find((i) => i.ruleId === "funding-erosion")!;
  assert.ok(["earnings risk", "solvency risk"].includes(fe.diagnostics.classification as string));
  assert.ok(fe.routeTo.includes("ALCO"));
});

test("detection is idempotent: re-running in the same period does not duplicate insights", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  const first = await runDetectors(ctx);
  const second = await runDetectors(ctx);
  assert.equal(first.insights.length, 6);
  assert.equal(second.insights.length, 0);
  assert.equal(second.skipped.length, 6);
  const all = await rt.store.listInsights({});
  assert.equal(all.length, 6);
});

test("detectors do not fire when thresholds are relaxed (config-driven, not hardcoded)", async () => {
  const rt = await buildTestRuntime(TEST_PERIOD);
  const ctx = await testDetectContext(rt);
  ctx.thresholds = { ...rt.thresholds, nplDriftBreachPct: 99, nplDriftRisePp90d: 99, stage2RisePp6m: 99, nimCompressionPp6m: 99, capitalBreachHorizonMonths: 0.0001, fundingTermShiftPp12m: 99, concentrationTop10RisePp90d: 99, top10ObligorAppetitePct: 99, singleObligorLimitPctOfFunds: 99, singleObligorApproachPctOfLimit: 100 };
  const result = await runDetectors(ctx);
  // With relaxed parameters nothing should trigger (capital horizon 0.0001 effectively never < horizon).
  assert.equal(result.insights.length, 0);
});
