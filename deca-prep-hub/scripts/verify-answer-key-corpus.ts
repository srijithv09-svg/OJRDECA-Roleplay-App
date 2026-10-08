import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractExamAnswerKey } from "../src/lib/exams/answer-key-extraction";
import { extractPdfTextFromBuffer } from "../src/lib/pdf/server-text-extraction";
import { detectResourceMetadata } from "../src/lib/resources/metadata-detection";
import baseline from "./fixtures/exam-key-corpus.json";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function findPdfs(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findPdfs(file));
    else if (entry.name.toLowerCase().endsWith(".pdf")) files.push(file);
  }
  return files;
}

async function main() {
  const root = path.resolve(process.argv[2] ?? "import_data/raw_pdfs");
  const cache = new Map<string, number>();
  let total = 0;
  let folders = 0;
  let rejectedReferences = 0;
  const failures: string[] = [];
  const references = new Set<string>();
  const filesByFolder = new Map<string, string[]>();

  for (const file of await findPdfs(root)) {
    const folder = path.dirname(path.relative(root, file));
    filesByFolder.set(folder, [...(filesByFolder.get(folder) ?? []), file]);
  }

  for (const [folder, files] of filesByFolder) {
    let passed = 0;
    let examined = 0;
    for (const file of files) {
      const filename = path.basename(file);
      const metadata = detectResourceMetadata(filename);
      if (metadata.resource_type !== "exam" && !/exam.*blueprint/i.test(filename)) continue;
      try {
        const buffer = await readFile(file);
        const pdfHash = hash(buffer);
        if (/exam.*blueprint/i.test(filename)) {
          if (!references.has(pdfHash)) {
            const { text } = await extractPdfTextFromBuffer(buffer);
            assert.throws(() => extractExamAnswerKey(text), /No readable/);
            references.add(pdfHash);
          }
          rejectedReferences++;
          continue;
        }
        examined++;
        if (!cache.has(pdfHash)) {
          const expected = baseline.exams[pdfHash as keyof typeof baseline.exams];
          assert.ok(expected, "PDF is not in the independently verified baseline; review it before claiming support");
          const { text } = await extractPdfTextFromBuffer(buffer);
          const rows = extractExamAnswerKey(text);
          assert.equal(rows.length, 100);
          assert.equal(hash(rows.map((row) => row.correct_answer).join("")), expected.answer_sha256, "extracted answers differ from independent pdfplumber baseline");
          cache.set(pdfHash, rows.length);
        }
        passed++;
      } catch (error) {
        failures.push(`${folder}/${filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (examined) {
      folders++;
      total += passed;
      console.log(`${folder}: ${passed}/${examined} exams verified (100 answers each)`);
    }
  }

  console.log(`Verified ${total} exam files across ${folders} folders; ${cache.size} distinct PDF contents; ${rejectedReferences} reference blueprints correctly rejected.`);
  assert.ok(total > 0, "No exam PDFs found; corpus verification did not run");
  assert.equal(failures.length, 0, failures.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
