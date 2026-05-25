import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getEventCodeFromFilenameOrTitle,
  getInstructionalAreaForResource,
  getScenarioNumberFromFilenameOrTitle,
  type DecaInstructionalAreaResource,
} from "../src/lib/deca/instructional-areas";
import type { Database } from "../src/lib/types";

type RoleplayResourceRow = DecaInstructionalAreaResource & {
  id: string;
  instructional_area: string | null;
};

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
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for instructional area repair.");
  }

  return { supabaseKey, supabaseUrl };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run repair:instructional-areas");
    return;
  }

  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("resources")
    .select(
      "id,title,original_filename,resource_type,instructional_area,year,file_path,storage_path",
    )
    .eq("resource_type", "roleplay")
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Roleplay resource query failed: ${error.message}`);
  }

  const resources = (data ?? []) as RoleplayResourceRow[];
  const unknowns: RoleplayResourceRow[] = [];
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const resource of resources) {
    const nextInstructionalArea = getInstructionalAreaForResource(resource);
    const eventCode = getEventCodeFromFilenameOrTitle(resource);
    const scenarioNumber = getScenarioNumberFromFilenameOrTitle(resource);

    if (!nextInstructionalArea) {
      unknowns.push(resource);
      console.warn(
        [
          `Skipped unknown: ${resource.id}`,
          `  title: ${resource.title ?? "null"}`,
          `  original_filename: ${resource.original_filename ?? "null"}`,
          `  year: ${resource.year ?? "null"}`,
          `  event_code: ${eventCode ?? "not detected"}`,
          `  scenario: ${scenarioNumber ?? "not detected"}`,
        ].join("\n"),
      );
      continue;
    }

    if (resource.instructional_area === nextInstructionalArea) {
      unchanged += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("resources")
      .update({ instructional_area: nextInstructionalArea })
      .eq("id", resource.id);

    if (updateError) {
      failed += 1;
      console.error(
        `Failed to update ${resource.id} (${resource.title ?? "untitled"}): ${updateError.message}`,
      );
      continue;
    }

    updated += 1;
    console.log(
      [
        `Updated: ${resource.id}`,
        `  title: ${resource.title ?? "null"}`,
        `  event_code: ${eventCode ?? "not detected"}`,
        `  scenario: ${scenarioNumber ?? "not detected"}`,
        `  instructional_area: ${resource.instructional_area ?? "null"} -> ${nextInstructionalArea}`,
      ].join("\n"),
    );
  }

  console.log("\nInstructional area repair summary");
  console.log(`Roleplay resources scanned: ${resources.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Already correct: ${unchanged}`);
  console.log(`Skipped unknowns: ${unknowns.length}`);
  console.log(`Failed updates: ${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
