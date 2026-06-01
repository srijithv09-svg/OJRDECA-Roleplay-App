import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { detectDecaEventCodeFromText, getDecaEventByCode } from "../src/lib/deca/events";
import {
  textClearlyIndicatesExam,
  textClearlyIndicatesReference,
} from "../src/lib/resources/metadata-detection";
import type { Database, ResourceListItem } from "../src/lib/types";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

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
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!supabaseKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for event metadata repair.");
  }

  return { supabaseKey, supabaseUrl };
}

function detectionText(resource: ResourceListItem) {
  return [
    resource.title,
    resource.original_filename,
    resource.storage_path,
    resource.file_path,
    resource.import_notes,
  ]
    .filter(Boolean)
    .join(" ");
}

async function main() {
  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("resources")
    .select(
      "id,title,cluster,event_code,event_name,event_category,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,performance_indicators_reviewed,confidence_score,import_notes,file_path,storage_path",
    )
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Resource query failed: ${error.message}`);
  }

  const resources = (data ?? []) as ResourceListItem[];
  const unmatched: string[] = [];
  let updated = 0;
  let roleplaysFixed = 0;
  let examsSkipped = 0;
  let referencesSkipped = 0;
  let failed = 0;

  for (const resource of resources) {
    const text = detectionText(resource);
    const clearlyExam = resource.resource_type === "exam" || textClearlyIndicatesExam(text);
    const clearlyReference =
      resource.resource_type === "reference" || textClearlyIndicatesReference(text);

    if (clearlyReference) {
      referencesSkipped += 1;
      continue;
    }

    if (clearlyExam) {
      examsSkipped += 1;
      continue;
    }

    const detectedCode = detectDecaEventCodeFromText(text);
    const event = getDecaEventByCode(detectedCode);

    if (!event) {
      unmatched.push(`${resource.id} | ${resource.title}`);
      continue;
    }

    const nextResourceType =
      resource.resource_type === "unknown" ? event.resourceTypeHint : resource.resource_type;

    const patch = {
      cluster: event.cluster,
      event_category: event.category,
      event_code: event.code,
      event_name: event.name,
      resource_type: nextResourceType,
    };

    const unchanged =
      resource.cluster === patch.cluster &&
      resource.event_category === patch.event_category &&
      resource.event_code === patch.event_code &&
      resource.event_name === patch.event_name &&
      resource.resource_type === patch.resource_type;

    if (unchanged) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("resources")
      .update(patch)
      .eq("id", resource.id);

    if (updateError) {
      failed += 1;
      console.error(`Failed ${resource.id} (${resource.title}): ${updateError.message}`);
      continue;
    }

    updated += 1;

    if (patch.resource_type === "roleplay") {
      roleplaysFixed += 1;
    }

    console.log(`Updated ${resource.id}: ${resource.title}`);
    console.log(`  ${event.code} | ${event.name} | ${event.cluster} | ${event.category}`);
  }

  console.log("\nDECA event metadata repair summary");
  console.log(`Scanned: ${resources.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Roleplays fixed: ${roleplaysFixed}`);
  console.log(`Exams skipped: ${examsSkipped}`);
  console.log(`References skipped: ${referencesSkipped}`);
  console.log(`Unknown/unmatched: ${unmatched.length}`);
  console.log(`Failed: ${failed}`);

  if (unmatched.length > 0) {
    console.log("\nUnmatched resources");
    unmatched.slice(0, 50).forEach((resource) => console.log(`- ${resource}`));

    if (unmatched.length > 50) {
      console.log(`...and ${unmatched.length - 50} more.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
