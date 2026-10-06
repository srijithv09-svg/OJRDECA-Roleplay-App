import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const requiredTables = {
  profiles: "id,role,selected_cluster",
  resources:
    "id,title,resource_type,approval_status,event_code,event_category,storage_path",
  exam_answer_keys: "id,resource_id,question_number,correct_answer",
  exam_attempts:
    "id,user_id,resource_id,score,total_questions,percentage,completed_at",
  exam_attempt_answers:
    "id,attempt_id,question_number,selected_answer,correct_answer,is_correct",
  roleplay_attempts:
    "id,user_id,resource_id,response_notes,performance_indicator_notes,self_reflection,judge_feedback,audio_path,transcript,transcript_status,confidence_rating,created_at,updated_at",
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configure Supabase URL and server-only service role key before running the database check.",
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const results = await Promise.all(
    Object.entries(requiredTables).map(async ([table, columns]) => {
      const { error } = await client.from(table).select(columns).limit(0);
      return { table, error };
    }),
  );
  for (const { table, error } of results) {
    console.log(
      `${error ? "FAIL" : "PASS"} ${table}${error ? `: ${error.message}` : ""}`,
    );
  }
  if (results.some((result) => result.error)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Database health check failed.",
  );
  process.exitCode = 1;
});
