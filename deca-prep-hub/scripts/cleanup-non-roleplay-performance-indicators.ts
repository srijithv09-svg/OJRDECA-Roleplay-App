import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "../src/lib/types";

type ResourceRow = {
  id: string;
  performance_indicators: string[] | null;
  performance_indicators_reviewed: boolean | null;
  resource_type: string | null;
  title: string;
};

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
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for cleanup.");
  }

  return { supabaseKey, supabaseUrl };
}

async function main() {
  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("resources")
    .select("id,title,resource_type,performance_indicators,performance_indicators_reviewed")
    .neq("resource_type", "roleplay")
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Resource query failed: ${error.message}`);
  }

  const resources = (data ?? []) as ResourceRow[];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const resource of resources) {
    if (!resource.performance_indicators_reviewed) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("resources")
      .update({ performance_indicators_reviewed: false })
      .eq("id", resource.id);

    if (updateError) {
      failed += 1;
      console.error(`Failed ${resource.id} (${resource.title}): ${updateError.message}`);
      continue;
    }

    updated += 1;
    console.log(`Updated ${resource.id}: ${resource.title}`);
  }

  console.log("\nNon-roleplay performance indicator cleanup summary");
  console.log(`Scanned count: ${resources.length}`);
  console.log(`Updated count: ${updated}`);
  console.log(`Skipped count: ${skipped}`);
  console.log(`Failed count: ${failed}`);
  console.log("Performance indicator arrays were preserved; reviewed flags were cleared only.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
