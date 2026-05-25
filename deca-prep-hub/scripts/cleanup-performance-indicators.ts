import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "../src/lib/types";

type ResourceIndicatorRow = {
  id: string;
  performance_indicators: string[] | null;
  performance_indicators_reviewed: boolean | null;
  title: string;
};

const badIndicatorPatterns = [
  /participant instructions/i,
  /21st century skills/i,
  /exceeds expectations/i,
  /meets expectations/i,
  /below expectations/i,
  /little\/?no/i,
  /the participants are to be evaluated/i,
  /\bof this event\.?$/i,
  /other performance indicators/i,
  /performance indicators stated/i,
  /\brubric\b/i,
  /\bevaluation form\b/i,
  /\bevaluated on\b/i,
  /\bjudge(?:'s|s)?\b/i,
  /\bscore\b/i,
  /\bpoints?\b/i,
  /\brating\b/i,
  /\bmanual\b/i,
  /^performance indicators?$/i,
  /^instructional areas?$/i,
  /^participants? will/i,
];

const decaActionVerbPattern =
  /^(analyze|apply|assess|calculate|classify|compare|conduct|convert|create|define|demonstrate|describe|determine|develop|discuss|distinguish|establish|explain|foster|handle|identify|interpret|maintain|prepare|provide|reinforce|select|show|use)\b/i;

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
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for performance indicator cleanup.");
  }

  return { supabaseKey, supabaseUrl };
}

function normalizeIndicator(indicator: string) {
  return indicator.replace(/\s+/g, " ").trim();
}

function isConciseDecaPerformanceIndicator(indicator: string) {
  const normalized = normalizeIndicator(indicator);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (normalized.length < 12 || normalized.length > 180 || words.length < 3) {
    return false;
  }

  if (badIndicatorPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (!/[a-z]/i.test(normalized) || /^[^a-z]+$/i.test(normalized)) {
    return false;
  }

  return decaActionVerbPattern.test(normalized);
}

function cleanupIndicators(indicators: string[] | null) {
  const removed: string[] = [];
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const indicator of indicators ?? []) {
    const normalized = normalizeIndicator(indicator);
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      if (normalized) {
        removed.push(normalized);
      }
      continue;
    }

    seen.add(key);

    if (isConciseDecaPerformanceIndicator(normalized)) {
      kept.push(normalized);
    } else {
      removed.push(normalized);
    }
  }

  return {
    cleaned: kept.length > 0 ? kept : null,
    removed,
  };
}

function indicatorsAreEqual(left: string[] | null, right: string[] | null) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run cleanup:performance-indicators");
    return;
  }

  const { supabaseKey, supabaseUrl } = getSupabaseCredentials();
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("resources")
    .select("id,title,performance_indicators,performance_indicators_reviewed")
    .not("performance_indicators", "is", null)
    .order("title", { ascending: true });

  if (error) {
    throw new Error(`Resource query failed: ${error.message}`);
  }

  const resources = (data ?? []) as ResourceIndicatorRow[];
  let updated = 0;
  let unchanged = 0;
  let cleared = 0;
  let removedIndicators = 0;
  let failed = 0;

  for (const resource of resources) {
    const { cleaned, removed } = cleanupIndicators(resource.performance_indicators);

    if (indicatorsAreEqual(resource.performance_indicators, cleaned)) {
      unchanged += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("resources")
      .update({
        performance_indicators: cleaned,
        performance_indicators_reviewed: false,
      })
      .eq("id", resource.id);

    if (updateError) {
      failed += 1;
      console.error(`Failed to update ${resource.id} (${resource.title}): ${updateError.message}`);
      continue;
    }

    updated += 1;
    removedIndicators += removed.length;

    if (!cleaned) {
      cleared += 1;
    }

    console.log(`Updated ${resource.id}: ${resource.title}`);
    console.log(`  kept: ${cleaned?.length ?? 0}`);
    console.log(`  removed: ${removed.length}`);
  }

  console.log("\nPerformance indicator cleanup summary");
  console.log(`Resources scanned: ${resources.length}`);
  console.log(`Updated resources: ${updated}`);
  console.log(`Unchanged resources: ${unchanged}`);
  console.log(`Resources cleared to null: ${cleared}`);
  console.log(`Indicators removed: ${removedIndicators}`);
  console.log(`Failed updates: ${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
