import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

type RequiredTable =
  | "profiles"
  | "resources"
  | "exam_answer_keys"
  | "exam_attempts"
  | "exam_attempt_answers"
  | "roleplay_attempts"
  | "events"
  | "key_sets"
  | "concepts"
  | "key_set_concepts"
  | "questions"
  | "question_attempts"
  | "concept_mastery"
  | "roleplay_scenarios";

const requiredTables: RequiredTable[] = [
  "profiles",
  "resources",
  "exam_answer_keys",
  "exam_attempts",
  "exam_attempt_answers",
  "roleplay_attempts",
  "events",
  "key_sets",
  "concepts",
  "key_set_concepts",
  "questions",
  "question_attempts",
  "concept_mastery",
  "roleplay_scenarios",
];

const keyColumns: Record<RequiredTable, string[]> = {
  profiles: ["role", "updated_at"],
  resources: ["event_code", "event_category", "performance_indicators_reviewed"],
  exam_answer_keys: [],
  exam_attempts: [],
  exam_attempt_answers: [],
  roleplay_attempts: ["transcript_status", "ai_feedback_status"],
  events: ["code", "is_pilot"],
  key_sets: ["event_id"],
  concepts: ["slug"],
  key_set_concepts: ["key_set_id", "concept_id"],
  questions: ["question_type", "ladder_stage", "status"],
  question_attempts: ["user_id"],
  concept_mastery: ["status"],
  roleplay_scenarios: ["performance_indicators", "status"],
};
const probeColumns: Record<RequiredTable, string> = {
  profiles: "id",
  resources: "id",
  exam_answer_keys: "id",
  exam_attempts: "id",
  exam_attempt_answers: "id",
  roleplay_attempts: "id",
  events: "id",
  key_sets: "id",
  concepts: "id",
  key_set_concepts: "key_set_id",
  questions: "id",
  question_attempts: "id",
  concept_mastery: "user_id",
  roleplay_scenarios: "id",
};
const allowedProfileRoles = ["student", "admin", "advisor"] as const;

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. This health check must run locally/server-side only.",
    );
  }

  return { serviceRoleKey, supabaseUrl };
}

function describeError(error: { code?: string; message: string }) {
  return error.code ? `${error.code}: ${error.message}` : error.message;
}

function isConnectionError(error: { message: string }) {
  return error.message.toLowerCase().includes("fetch failed");
}

async function main() {
  const { serviceRoleKey, supabaseUrl } = getEnv();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const missingTables: Array<{ table: RequiredTable; error: string }> = [];
  const missingColumns: Array<{ table: RequiredTable; column: string; error: string }> = [];
  const connectionErrors: Array<{ table: RequiredTable; error: string }> = [];
  const invalidProfileRoles: Array<{ id: string; role: string | null }> = [];
  const okTables: RequiredTable[] = [];

  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select(probeColumns[table]).limit(0);

    if (error) {
      if (isConnectionError(error)) {
        connectionErrors.push({ table, error: describeError(error) });
        continue;
      }

      missingTables.push({ table, error: describeError(error) });
      continue;
    }

    okTables.push(table);

    for (const column of keyColumns[table]) {
      const { error: columnError } = await supabase.from(table).select(column).limit(0);

      if (columnError) {
        missingColumns.push({
          table,
          column,
          error: describeError(columnError),
        });
      }
    }
  }

  if (!missingTables.some(({ table }) => table === "profiles") && connectionErrors.length === 0) {
    const { data: profilesWithRoles, error: rolesError } = await supabase
      .from("profiles")
      .select("id,role")
      .limit(1000);

    if (rolesError) {
      missingColumns.push({
        table: "profiles",
        column: "role",
        error: describeError(rolesError),
      });
    } else {
      for (const profile of profilesWithRoles ?? []) {
        if (!allowedProfileRoles.includes(profile.role as (typeof allowedProfileRoles)[number])) {
          invalidProfileRoles.push({ id: profile.id, role: profile.role });
        }
      }
    }
  }

  console.log("Database health check");
  console.log("");
  console.log("Tables OK:");
  console.log(okTables.length > 0 ? okTables.map((table) => `- ${table}`).join("\n") : "- None");
  console.log("");
  console.log("Connection errors:");
  console.log(
    connectionErrors.length > 0
      ? connectionErrors.map(({ error, table }) => `- ${table}: ${error}`).join("\n")
      : "- None",
  );
  console.log("");
  console.log("Missing tables:");
  console.log(
    missingTables.length > 0
      ? missingTables.map(({ error, table }) => `- ${table}: ${error}`).join("\n")
      : "- None",
  );
  console.log("");
  console.log("Profile role values:");
  console.log(
    invalidProfileRoles.length > 0
      ? invalidProfileRoles
          .map(({ id, role }) => `- ${id}: ${role ?? "null"}`)
          .join("\n")
      : `- OK (${allowedProfileRoles.join(", ")})`,
  );
  console.log("");
  console.log("Missing columns:");
  console.log(
    missingColumns.length > 0
      ? missingColumns
          .map(({ column, error, table }) => `- ${table}.${column}: ${error}`)
          .join("\n")
      : "- None",
  );

  if (connectionErrors.length > 0) {
    console.log("");
    console.log("Recommended SQL/migration note:");
    console.log(
      "The health check could not reach Supabase, so table and column status could not be verified. Confirm local env values, network access, and Supabase project availability, then rerun npm run check:db before deployment.",
    );
    process.exitCode = 1;
  } else if (missingTables.length > 0 || missingColumns.length > 0 || invalidProfileRoles.length > 0) {
    console.log("");
    console.log("Recommended SQL/migration note:");
    console.log(
      "Apply the missing Supabase migrations with the Supabase CLI or paste the matching SQL into the Supabase SQL Editor, then rerun npm run check:db. If newly created tables such as roleplay_attempts or the Phase 1 learning tables still return schema-cache errors, reload the PostgREST schema cache from Supabase before deploying code that queries them.",
    );
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("All required tables and key columns are reachable through the Supabase Data API.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database health check failed.");
  process.exitCode = 1;
});
