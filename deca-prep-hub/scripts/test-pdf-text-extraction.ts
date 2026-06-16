import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfTextFromBuffer } from "../src/lib/pdf/server-text-extraction";
import type { Database } from "../src/lib/types";

const resourcesBucket = "resources";

loadEnvConfig(process.cwd());

function getSupabaseCredentials() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for resource PDF text testing.");
  }

  return { supabaseKey, supabaseUrl };
}

function parseTarget() {
  const target = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

  if (!target) {
    throw new Error("Usage: npm run test:pdf-text -- <resource-id | local-pdf-path>");
  }

  return target;
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function loadBufferFromResource(resourceId: string) {
  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("id,title,original_filename,storage_path,detected_text")
    .eq("id", resourceId)
    .maybeSingle();

  if (resourceError) {
    throw new Error(resourceError.message);
  }

  if (!resource) {
    throw new Error(`Resource ${resourceId} was not found.`);
  }

  if (!resource.storage_path) {
    throw new Error(`Resource ${resourceId} has no storage_path.`);
  }

  const { data, error } = await supabase.storage
    .from(resourcesBucket)
    .download(resource.storage_path);

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to download resource PDF from private storage.");
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    label: `${resource.title} (${resource.storage_path})`,
  };
}

async function loadBufferFromTarget(target: string) {
  if (looksLikeUuid(target)) {
    return loadBufferFromResource(target);
  }

  const filePath = path.resolve(process.cwd(), target);

  if (!existsSync(filePath)) {
    throw new Error(`Local PDF path not found: ${filePath}`);
  }

  return {
    buffer: await readFile(filePath),
    label: filePath,
  };
}

async function main() {
  const target = parseTarget();
  const { buffer, label } = await loadBufferFromTarget(target);
  const result = await extractPdfTextFromBuffer(buffer);
  const normalizedPreview = result.text.replace(/\s+/g, " ").trim().slice(0, 500);

  console.log("PDF text extraction test");
  console.log(`target: ${label}`);
  console.log(`parser: ${result.parser}`);
  console.log(`character_count: ${result.text.length}`);
  console.log("preview:");
  console.log(normalizedPreview);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PDF text extraction test failed.");
  process.exitCode = 1;
});
