import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSeedBank, MEASURE_NAMES } from "../lib/seed/bank.ts";
import { TEST_PERIOD } from "./helpers.ts";

test("seed is deterministic for a fixed end period", () => {
  const a = generateSeedBank(TEST_PERIOD);
  const b = generateSeedBank(TEST_PERIOD);
  assert.deepEqual(a.records, b.records);
});

test("seed covers 24 months and all ontology concepts", () => {
  const bank = generateSeedBank(TEST_PERIOD);
  assert.equal(bank.periods.length, 24);
  assert.equal(bank.periods[23], TEST_PERIOD);
  const concepts = new Set(bank.records.map((r) => r.concept));
  for (const name of Object.keys(MEASURE_NAMES)) {
    const concept = bank.records.find((r) => r.sourceMeasure === (MEASURE_NAMES as Record<string, string>)[name])?.concept;
    assert.ok(concept, `no seed records for measure ${name}`);
    assert.ok(concepts.has(concept));
  }
});

test("seed tells the intended story: NPL breaches 5% with a 90d rise, driven by reclassification", () => {
  const bank = generateSeedBank(TEST_PERIOD);
  const npl = bank.records.filter((r) => r.concept === "asset_quality.npl_ratio").sort((a, b) => a.period.localeCompare(b.period));
  const last = npl[npl.length - 1];
  const ago3 = npl[npl.length - 4];
  assert.ok(last.value > 5, `NPL ${last.value} should breach 5%`);
  assert.ok(last.value - ago3.value >= 1.0, `90d rise ${last.value - ago3.value} should be >= 1pp`);
  const reclass = bank.records.filter((r) => r.concept === "asset_quality.reclassified_forborne").sort((a, b) => a.period.localeCompare(b.period));
  const recent3 = reclass.slice(-3).reduce((a, r) => a + r.value, 0);
  const newDef = bank.records.filter((r) => r.concept === "asset_quality.new_defaults").sort((a, b) => a.period.localeCompare(b.period));
  const newDef3 = newDef.slice(-3).reduce((a, r) => a + r.value, 0);
  assert.ok(recent3 > newDef3, "reclassification contribution must exceed new defaults in the final quarter");
});
