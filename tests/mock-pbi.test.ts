import { test } from "node:test";
import assert from "node:assert/strict";
import { MockPowerBiClient, conceptForMeasure } from "../lib/pbi/mock.ts";
import { buildDaxAggregate } from "../lib/pbi/client.ts";
import { demoIdentity } from "../lib/auth/roles.ts";
import { TEST_PERIOD } from "./helpers.ts";

test("mock tenant lists workspaces, certified datasets, reports", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  const id = demoIdentity();
  const ws = await pbi.listWorkspaces(id);
  assert.equal(ws.length, 1);
  const ds = await pbi.listDatasets(id, ws[0].id);
  assert.ok(ds.some((d) => d.isCertified));
  const reports = await pbi.listReports(id, ws[0].id);
  assert.ok(reports.every((r) => r.webUrl.includes("powerbi.com")));
});

test("metadata exposes tables, columns, measures with DAX, relationships", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  const md = await pbi.getMetadata(demoIdentity(), "ds-certified-banking-model");
  assert.ok(md.tables.some((t) => t.name === "Loans"));
  assert.ok(md.measures.length >= 25, "seed measures plus decoys");
  assert.ok(md.measures.every((m) => typeof m.dax === "string" && m.dax.length > 0));
  assert.ok(md.relationships.length >= 1);
});

test("aggregate query returns only the requested period range and measure", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  const rows = await pbi.executeAggregate(demoIdentity(), "ds-certified-banking-model", {
    measure: "NPL Ratio (%)",
    concept: "asset_quality.npl_ratio",
    from: "2026-01",
    to: TEST_PERIOD,
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.period >= "2026-01" && r.period <= TEST_PERIOD));
  assert.ok(rows.every((r) => r.sourceMeasure === "NPL Ratio (%)"));
  assert.equal(conceptForMeasure("NPL Ratio (%)"), "asset_quality.npl_ratio");
});

test("unknown measure is rejected", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  await assert.rejects(() =>
    pbi.executeAggregate(demoIdentity(), "ds-certified-banking-model", {
      measure: "DROP TABLE Loans; --",
      concept: "x",
      from: "2026-01",
      to: TEST_PERIOD,
    }),
  /Unknown measure/);
});

test("DAX builder emits an EVALUATE/SUMMARIZE aggregate (never SELECT row-level)", () => {
  const dax = buildDaxAggregate({
    measure: "NPL Ratio (%)",
    concept: "asset_quality.npl_ratio",
    from: "2025-04",
    to: TEST_PERIOD,
    groupBy: ["Loans[Segment]"],
  });
  assert.match(dax, /^EVALUATE /);
  assert.match(dax, /SUMMARIZE/);
  assert.match(dax, /FILTER/);
  assert.ok(!/SELECT/i.test(dax), "no raw SELECT of row-level data");
});
