import assert from "node:assert/strict";
import { test } from "node:test";
import { detectResourceMetadata, textClearlyIndicatesReference } from "../src/lib/resources/metadata-detection";
import { uploadResourceBatch } from "../src/lib/resources/upload";
import { normalizeResourceUploadMetadata } from "../src/lib/resources/upload-metadata";

test("reference labels take priority over event codes and exam keywords", () => {
  for (const filename of [
    "MCS_Reference_2025.pdf",
    "Marketing_PIs_2025.pdf",
    "Marketing_Performance_Indicators_2025.pdf",
    "Finance_Cluster_Guide.pdf",
    "Finance_Exam_Blueprint.pdf",
    "MCS_Guidelines.pdf",
  ]) {
    const metadata = detectResourceMetadata(filename);
    assert.equal(metadata.resource_type, "reference", filename);
    assert.equal(metadata.instructional_area, null);
    assert.equal("performance_indicators" in metadata, false);
  }
  assert.equal(textClearlyIndicatesReference("Reference/MCS/2025.pdf"), true);
});

test("ordinary exam and roleplay filenames retain their types", () => {
  assert.equal(detectResourceMetadata("Marketing_Cluster_Sample_Exam_2025.pdf").resource_type, "exam");
  assert.equal(detectResourceMetadata("MCS-25-ICDC.pdf").resource_type, "roleplay");
  assert.equal(detectResourceMetadata("unidentified.pdf").resource_type, "unknown");
});

test("a manually assigned reference type reaches the upload endpoint without per-file indicators", async () => {
  const file = new File(["pdf"], "MCS-25-ICDC.pdf", { type: "application/pdf" });
  const draft = { ...detectResourceMetadata(file.name), file, id: "reference-draft", resource_type: "reference" as const };
  const result = await uploadResourceBatch([draft], "token", () => {}, async (_url, init) => {
    const metadata = JSON.parse((init!.body as FormData).get("metadata") as string)[0];
    assert.equal(metadata.resource_type, "reference");
    assert.equal("performance_indicators" in metadata, false);
    assert.equal("performance_indicators_reviewed" in metadata, false);
    return Response.json({ uploadedCount: 1, results: [{ resource: { id: "reference-resource" } }] });
  });
  assert.equal(result.uploadedCount, 1);
});

test("reviewed empty metadata survives upload while omitted fields retain filename detection", () => {
  const filename = "MCS_2025_Roleplay.pdf";
  const detected = normalizeResourceUploadMetadata(filename);
  assert.equal(detected.event_code, "MCS");
  assert.equal(detected.year, 2025);
  const cleared = normalizeResourceUploadMetadata(filename, {
    original_filename: filename, event_code: null, year: null, instructional_area: "", cluster: "",
  });
  assert.equal(cleared.event_code, null);
  assert.equal(cleared.event_name, null);
  assert.equal(cleared.event_category, null);
  assert.equal(cleared.year, null);
  assert.equal(cleared.instructional_area, null);
  assert.equal(cleared.cluster, null);
  const selected = normalizeResourceUploadMetadata(filename, { original_filename: filename, event_code: " act ", resource_type: "reference" });
  assert.equal(selected.event_code, "ACT");
  assert.equal(selected.cluster, "Finance");
  assert.equal(selected.instructional_area, null);
  assert.equal(selected.year, 2025);
});
