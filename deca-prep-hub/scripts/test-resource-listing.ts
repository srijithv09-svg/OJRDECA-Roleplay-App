import assert from "node:assert/strict";
import { test } from "node:test";

test("large approval queues and student reference libraries retain resources beyond the response limit", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://resource-list-tests.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const rows = Array.from({ length: 1203 }, (_, index) => ({ id: `resource-${index}`, title: `Document ${index}` }));
  const originalFetch = globalThis.fetch;
  let publicQuery = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "resource-list-tests.invalid", "never contact a real database");
    assert.equal(url.pathname, "/rest/v1/resources");
    if (publicQuery) {
      assert.equal(url.searchParams.get("approval_status"), "eq.approved");
      assert.equal(url.searchParams.get("resource_type"), "eq.reference");
      assert.ok(!url.searchParams.get("select")?.includes("storage_path"));
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return Response.json(rows.slice(offset, offset + 1000));
  };
  try {
    const { ResourcesService } = await import("../src/lib/services/resources");
    assert.deepEqual((await ResourcesService.listResources()).map(row => row.id), rows.map(row => row.id));
    publicQuery = true;
    assert.deepEqual((await ResourcesService.listApprovedPublicResources({ resourceType: "reference" })).map(row => row.id), rows.map(row => row.id));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
