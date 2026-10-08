import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// A local parser test alone cannot catch native/worker files omitted from a deployment.
async function main() {
  const tracePath = path.resolve(".next/server/app/api/admin/exam-keys/[id]/extract/route.js.nft.json");
  assert.ok(existsSync(tracePath), "Run npm run build before checking the deployment's PDF runtime.");
  const trace: { files: string[] } = JSON.parse(await readFile(tracePath, "utf8"));
  const files = trace.files.map((file) => path.resolve(path.dirname(tracePath), file));
  assert.ok(files.some((file) => /@napi-rs[\\/]canvas[\\/]index\.js$/.test(file)), "Canvas package omitted from deployment.");
  assert.ok(files.some((file) => /@napi-rs[\\/]canvas-.*\.node$/.test(file)), "Native canvas binary omitted from deployment.");
  assert.ok(files.some((file) => /pdf-parse[\\/]dist[\\/]worker[\\/].*index\.(?:js|cjs)$/.test(file)), "PDF worker omitted from deployment.");
  assert.ok(files.some((file) => /pdf2json[\\/]dist[\\/]pdfparser\.(?:js|cjs)$/.test(file)), "Second reader omitted from deployment.");
  for (const file of files) assert.ok(existsSync(file), `Traced runtime file missing: ${file}`);
  console.log("PDF deployment trace includes both readers, canvas globals, worker and native binary.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
