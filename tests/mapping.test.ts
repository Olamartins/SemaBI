import { test } from "node:test";
import assert from "node:assert/strict";
import { MockPowerBiClient } from "../lib/pbi/mock.ts";
import { suggestMeasures } from "../lib/mapping/suggest.ts";
import { conceptByKey, ALL_CONCEPTS } from "../lib/ontology/index.ts";
import { gapRemediation, coverage } from "../lib/mapping/gaps.ts";
import { initMappings, certifyMapping } from "../lib/mapping/store.ts";
import { MemoryRepository } from "../lib/store/memory.ts";
import { demoIdentity } from "../lib/auth/roles.ts";
import { TEST_PERIOD } from "./helpers.ts";

async function metadata() {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  return pbi.getMetadata(demoIdentity("cro@firstmeridian.demo"), "ds-certified-banking-model");
}

test("auto-suggest ranks the NPL ratio measure above the NPL balance stock measure", async () => {
  const md = await metadata();
  const concept = conceptByKey("asset_quality.npl_ratio")!;
  const suggestions = suggestMeasures(concept, md);
  assert.equal(suggestions[0].measure, "NPL Ratio (%)");
  const balance = suggestions.find((s) => s.measure === "NPL Balance (NGN bn)");
  assert.ok(!balance || balance.score < suggestions[0].score / 2, "stock measure must be penalised for a ratio concept");
});

test("auto-suggest works for capital, liquidity, profitability, concentration concepts", async () => {
  const md = await metadata();
  for (const key of ["capital.car", "liquidity.lcr", "profitability.nim", "concentration.single_obligor_pct", "liquidity.deposit_mix"]) {
    const c = conceptByKey(key)!;
    const s = suggestMeasures(c, md);
    assert.ok(s.length > 0, `no suggestions for ${key}`);
    assert.ok(s[0].score >= 0.3, `top suggestion for ${key} too weak: ${JSON.stringify(s[0])}`);
  }
});

test("gap remediation returns concrete DAX when no measure exists", async () => {
  const md = await metadata();
  const concept = conceptByKey("asset_quality.npl_ratio")!;
  const gap = gapRemediation(concept.key, md, null);
  assert.equal(gap.status, "gap");
  assert.ok(gap.suggestedDax?.includes("DIVIDE"), "gap DAX should be a ratio expression");
});

test("mapping lifecycle: init drafts with auto-suggest, certify only mapped concepts", async () => {
  const md = await metadata();
  const store = new MemoryRepository();
  const mappings = await initMappings(store, md);
  assert.equal(mappings.length, ALL_CONCEPTS.length);
  const npl = mappings.find((m) => m.concept === "asset_quality.npl_ratio")!;
  assert.equal(npl.status, "draft");
  assert.equal(npl.measureName, "NPL Ratio (%)");
  assert.equal(npl.autoSuggested, true);
  const certified = await certifyMapping(store, "asset_quality.npl_ratio", "biadmin@x");
  assert.equal(certified.status, "certified");
  assert.equal(certified.certifiedBy, "biadmin@x");
  const cov = coverage(await store.getMappings(), ALL_CONCEPTS);
  assert.equal(cov.certified, 1);
  assert.equal(cov.total, ALL_CONCEPTS.length);
});

test("cannot certify a concept with an open gap (no measure mapped)", async () => {
  const md = await metadata();
  const store = new MemoryRepository();
  await initMappings(store, md);
  // Force a gap on one concept.
  await store.saveMapping({
    concept: "asset_quality.npl_ratio",
    status: "draft",
    measureName: null,
    daxExpression: "DIVIDE([NPL], [Loans], 0)",
    dimensions: {},
    autoSuggested: false,
    updatedAt: new Date().toISOString(),
  });
  await assert.rejects(() => certifyMapping(store, "asset_quality.npl_ratio", "biadmin@x"), /no measure mapped/);
});
