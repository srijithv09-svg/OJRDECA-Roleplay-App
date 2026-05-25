import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getResourcePdfSearchTerms,
  repairResourcePdfPath,
} from "../src/lib/services/resource-pdf-repair";
import type { Database } from "../src/lib/types";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getSupabaseCredentials() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full https://...supabase.co URL.",
    );
  }

  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for resource PDF debugging.");
  }

  return { supabaseKey, supabaseUrl };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run debug:resource-pdf -- RESOURCE_ID [--fix]");
    return;
  }

  const resourceId = args.find((arg) => !arg.startsWith("-"));
  const shouldFix = args.includes("--fix") || args.includes("--update");

  if (!resourceId) {
    throw new Error("Usage: npm run debug:resource-pdf -- RESOURCE_ID [--fix]");
  }

  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const result = await repairResourcePdfPath(supabase, resourceId, { update: shouldFix });
  const searchTerms = getResourcePdfSearchTerms(result.resource);

  console.log("Resource");
  console.log(`id: ${result.resource.id}`);
  console.log(`title: ${result.resource.title}`);
  console.log(`original_filename: ${result.resource.original_filename ?? "null"}`);
  console.log(`resource_type: ${result.resource.resource_type ?? "null"}`);
  console.log(`storage_path: ${result.resource.storage_path ?? "null"}`);
  console.log(`file_path: ${result.resource.file_path ?? "null"}`);

  console.log("\nSearch terms");
  for (const term of searchTerms) {
    console.log(`- ${term}`);
  }

  console.log("\nCandidate Storage objects");
  if (result.candidates.length === 0) {
    console.log("No candidates found.");
  } else {
    for (const candidate of result.candidates) {
      console.log(`- ${candidate.path}`);
      console.log(`  matched by: ${candidate.matchedBy.join(", ")}`);
    }
  }

  console.log("\nSigned URL attempts");
  if (result.signingAttempts.length === 0) {
    console.log("No candidate paths were available to sign.");
  } else {
    for (const attempt of result.signingAttempts) {
      console.log(`${attempt.success ? "SUCCESS" : "FAILED"} ${attempt.path}`);
      if (attempt.error) {
        console.log(`  error: ${attempt.error}`);
      }
    }
  }

  console.log("\nResult");
  console.log(`successful path: ${result.signedUrlPath ?? "none"}`);
  console.log(`updated resources.storage_path/file_path: ${shouldFix ? result.updated : "not requested"}`);
  if (result.signedUrl) {
    console.log(`signedUrl: ${result.signedUrl}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
