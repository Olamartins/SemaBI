import { test } from "node:test";
import assert from "node:assert/strict";
import { MockPowerBiClient } from "../lib/pbi/mock.ts";
import { MissingIdentityError, requireIdentity } from "../lib/pbi/identity.ts";
import { demoIdentity } from "../lib/auth/roles.ts";
import { TEST_PERIOD } from "./helpers.ts";

const query = {
  measure: "NPL Ratio by Segment (%)",
  concept: "asset_quality.npl_by_segment",
  from: "2026-01",
  to: TEST_PERIOD,
  groupBy: ["Loans[Segment]"],
};

test("RLS guard: query without an effective identity fails closed", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  await assert.rejects(
    () => pbi.executeAggregate(null as never, "ds-certified-banking-model", query),
    (e: unknown) => e instanceof MissingIdentityError,
  );
  await assert.rejects(
    () => pbi.executeAggregate({ userId: "", displayName: "", roles: [], rls: {}, mode: "delegated" }, "ds-certified-banking-model", query),
    (e: unknown) => e instanceof MissingIdentityError,
  );
  assert.throws(() => requireIdentity(undefined), MissingIdentityError);
});

test("RLS: restricted identity only receives in-scope segment rows (tenant-enforced)", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  const full = demoIdentity("cro@firstmeridian.demo");
  const restricted = demoIdentity("regional@firstmeridian.demo"); // RLS: Retail + SME only
  const fullRows = await pbi.executeAggregate(full, "ds-certified-banking-model", query);
  const restrictedRows = await pbi.executeAggregate(restricted, "ds-certified-banking-model", query);
  const fullSegs = new Set(fullRows.map((r) => r.dimensions.segment));
  const restrSegs = new Set(restrictedRows.map((r) => r.dimensions.segment));
  assert.ok(fullSegs.size > restrSegs.size, "full identity should see more segments");
  assert.deepEqual([...restrSegs].sort(), ["Retail", "SME"]);
  for (const seg of restrSegs) assert.ok(restricted.rls.segments!.includes(seg));
});

test("every query path requires identity: workspaces, datasets, metadata, reports", async () => {
  const pbi = new MockPowerBiClient(TEST_PERIOD);
  const anon = null as never;
  await assert.rejects(() => pbi.listWorkspaces(anon), MissingIdentityError);
  await assert.rejects(() => pbi.listDatasets(anon, "ws-commercial-prod"), MissingIdentityError);
  await assert.rejects(() => pbi.listReports(anon, "ws-commercial-prod"), MissingIdentityError);
  await assert.rejects(() => pbi.getMetadata(anon, "ds-certified-banking-model"), MissingIdentityError);
});

test("every executed query is audit-logged with actor and RLS scope", async () => {
  const entries: { actor: string; action: string; detail: Record<string, unknown> }[] = [];
  const pbi = new MockPowerBiClient(TEST_PERIOD, (e) => entries.push(e));
  const id = demoIdentity("regional@firstmeridian.demo");
  await pbi.executeAggregate(id, "ds-certified-banking-model", query);
  const q = entries.find((e) => e.action === "pbi.executeAggregate");
  assert.ok(q);
  assert.equal(q.actor, id.userId);
  assert.deepEqual(q.detail.rls, id.rls);
  assert.equal(q.detail.rlsApplied, true);
});
