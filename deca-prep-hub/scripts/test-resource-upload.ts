import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { detectResourceMetadata } from "../src/lib/resources/metadata-detection";
import { uploadResourceBatch, type UploadDraft } from "../src/lib/resources/upload";

function draft(file: File, id = crypto.randomUUID()): UploadDraft {
  return { ...detectResourceMetadata(file.name), file, id };
}

function success() {
  return Response.json({ uploadedCount: 1, failedCount: 0, results: [{ resource: { id: crypto.randomUUID() } }] });
}

test("a folder over the host limit uploads using individual requests with reviewed metadata", async () => {
  const folder = process.env.UPLOAD_TEST_PDF_DIR;
  const files = folder
    ? readdirSync(folder).filter((name) => name.toLowerCase().endsWith(".pdf")).map((name) =>
        new File([readFileSync(join(folder, name))], name, { type: "application/pdf" }))
    : Array.from({ length: 16 }, (_, index) =>
        new File([new Uint8Array(425_000)], `MCS-${index}.pdf`, { type: "application/pdf" }));
  assert.ok(files.reduce((bytes, file) => bytes + file.size, 0) > 4_500_000);
  const drafts = files.map((file) => ({ ...draft(file), title: "  Reviewed title  ", event_code: "MCS" }));
  const bulkBody = new FormData();
  files.forEach((file) => bulkBody.append("files", file));
  assert.ok((await new Response(bulkBody).arrayBuffer()).byteLength > 4_500_000);
  let requests = 0;
  let active = 0;
  const summary = await uploadResourceBatch(drafts, "test-token", () => {}, async (_url, init) => {
    active++;
    assert.equal(active, 1, "uploads must be sequential");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { Authorization: "Bearer test-token" });
    const body = init?.body as FormData;
    assert.equal(body.getAll("files").length, 1);
    const metadata = JSON.parse(body.get("metadata") as string);
    assert.equal(metadata.length, 1);
    assert.equal(metadata[0].title, "Reviewed title");
    assert.equal(metadata[0].event_code, "MCS");
    assert.equal(metadata[0].original_filename, files[requests].name);
    const size = (await new Response(body).arrayBuffer()).byteLength;
    assert.ok(size < 4_500_000, `request exceeds hosting limit: ${size}`);
    requests++;
    active--;
    return success();
  });
  assert.equal(requests, files.length);
  assert.equal(summary.uploadedCount, files.length);
  assert.equal(summary.failedCount, 0);
});

test("partial failures preserve draft identity even with duplicate filenames and allow remaining uploads", async () => {
  const drafts = Array.from({ length: 3 }, () => draft(new File(["pdf"], "same.pdf")));
  const completed: string[] = [];
  let calls = 0;
  const summary = await uploadResourceBatch(drafts, "token", (_progress, result) => {
    if (result && !result.error) completed.push(result.draftId);
  }, async () => ++calls === 2
    ? Response.json({ uploadedCount: 0, failedCount: 1, results: [{ error: "Storage unavailable" }] })
    : success());
  assert.equal(calls, 3);
  assert.equal(summary.uploadedCount, 2);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.results[1].error, "Storage unavailable");
  assert.deepEqual(completed, [drafts[0].id, drafts[2].id]);
});

test("plain-text hosting errors and invalid success responses produce useful file errors", async () => {
  for (const [response, message] of [
    [new Response("Request Entity Too Large", { status: 413 }), /Compress it or split/],
    [new Response("<html>Bad gateway</html>", { status: 502 }), /HTTP 502/],
    [new Response("unexpected response"), /did not confirm/],
    [Response.json({ error: "Admin access required" }, { status: 403 }), /Admin access required/],
  ] as const) {
    const summary = await uploadResourceBatch([draft(new File(["pdf"], "test.pdf"))], "token", () => {}, async () => response);
    assert.equal(summary.uploadedCount, 0);
    assert.equal(summary.failedCount, 1);
    assert.match(summary.results[0].error!, message);
  }
});

test("a lost response does not retry automatically or prevent the next file from uploading", async () => {
  let calls = 0;
  const summary = await uploadResourceBatch(
    [draft(new File(["pdf"], "first.pdf")), draft(new File(["pdf"], "next.pdf"))],
    "token", () => {}, async () => {
      if (++calls === 1) throw new TypeError("Failed to fetch");
      return success();
    },
  );
  assert.equal(calls, 2);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.uploadedCount, 1);
});
