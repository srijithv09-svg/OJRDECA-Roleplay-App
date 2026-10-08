import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { readVerifiedPdfAnswerKey } from "../src/lib/pdf/verified-answer-key";
import baseline from "./fixtures/exam-key-corpus.json";

// Read-only audit: downloads uploaded exam PDFs without publishing or changing any keys.
loadEnvConfig(process.cwd());
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, "Configure the Supabase URL and server key before auditing uploaded PDFs.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let total = 0;
  const cache = new Map<string, string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("resources").select("id,original_filename,storage_path")
      .eq("resource_type", "exam").order("id").range(offset, offset + 999);
    if (error) throw error;
    for (const exam of data ?? []) {
      assert.ok(exam.storage_path, `${exam.original_filename}: missing PDF`);
      const objectPath = exam.storage_path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^resources\//i, "");
      const downloaded = await db.storage.from("resources").download(objectPath);
      if (downloaded.error) throw downloaded.error;
      const buffer = new Uint8Array(await downloaded.data.arrayBuffer());
      const pdfHash = hash(buffer);
      if (!cache.has(pdfHash)) {
        const preview = await readVerifiedPdfAnswerKey(buffer);
        assert.equal(preview.verification, "matched", `${exam.original_filename}: cross-check incomplete`);
        const answersHash = hash(preview.rows.map((row) => row.correct_answer).join(""));
        const expected = baseline.exams[pdfHash as keyof typeof baseline.exams];
        if (expected) assert.equal(answersHash, expected.answer_sha256, `${exam.original_filename}: baseline mismatch`);
        cache.set(pdfHash, expected ? "two readers + independent baseline" : "two readers; new PDF has no pinned baseline");
      }
      console.log(`${exam.original_filename}: 100/100 verified (${cache.get(pdfHash)})`);
      total++;
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  assert.ok(total > 0, "No uploaded exam PDFs found; audit did not run.");
  console.log(`Verified ${total} uploaded exams (${cache.size} distinct PDFs). No keys or resources were changed.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
