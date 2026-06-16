import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConceptMastery,
  ConceptMasteryStatus,
  Database,
  Json,
} from "@/lib/types";

type LearningSupabase = SupabaseClient<Database>;

const masteryColumns =
  "user_id,concept_id,status,recognize_score,define_score,connect_score,apply_score,explain_score,improve_score,last_practiced_at,created_at,updated_at";

function toScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value / 100 : null;
}

function strongerStatus(current: ConceptMasteryStatus | null | undefined, next: ConceptMasteryStatus) {
  const rank: Record<ConceptMasteryStatus, number> = {
    almost_mastered: 3,
    learning: 1,
    mastered: 4,
    not_started: 0,
    practicing: 2,
  };
  const currentRank = current ? rank[current] : -1;

  return rank[next] >= currentRank ? next : current ?? next;
}

function feedbackStatus(score: number): ConceptMasteryStatus {
  if (score >= 80) {
    return "almost_mastered";
  }

  if (score >= 55) {
    return "practicing";
  }

  return "learning";
}

function revisionStatus(revisedScore: number, improvementScore: number): ConceptMasteryStatus {
  if (revisedScore >= 85 && improvementScore >= 15) {
    return "mastered";
  }

  if (revisedScore >= 75 || improvementScore >= 20) {
    return "almost_mastered";
  }

  if (revisedScore >= 55) {
    return "practicing";
  }

  return "learning";
}

export async function upsertConceptMasteryFromFeedback({
  conceptId,
  score,
  supabase,
  userId,
}: {
  conceptId: string;
  score: number;
  supabase: LearningSupabase;
  userId: string;
}) {
  const { data: current, error: currentError } = await supabase
    .from("concept_mastery")
    .select(masteryColumns)
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const currentMastery = current as ConceptMastery | null;
  const nextExplainScore = Math.max(
    currentMastery?.explain_score ?? 0,
    toScore(score) ?? 0,
  );

  const { data: mastery, error } = await supabase
    .from("concept_mastery")
    .upsert(
      {
        concept_id: conceptId,
        explain_score: nextExplainScore,
        last_practiced_at: new Date().toISOString(),
        status: strongerStatus(currentMastery?.status, feedbackStatus(score)),
        user_id: userId,
      },
      { onConflict: "user_id,concept_id" },
    )
    .select(masteryColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mastery;
}

export async function upsertConceptMasteryFromRevision({
  conceptId,
  improvementScore,
  revisedScore,
  supabase,
  userId,
}: {
  conceptId: string;
  improvementScore: number;
  revisedScore: number;
  supabase: LearningSupabase;
  userId: string;
}) {
  const { data: current, error: currentError } = await supabase
    .from("concept_mastery")
    .select(masteryColumns)
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const currentMastery = current as ConceptMastery | null;
  const nextImproveScore = Math.max(
    currentMastery?.improve_score ?? 0,
    toScore(improvementScore) ?? 0,
  );
  const nextExplainScore = Math.max(
    currentMastery?.explain_score ?? 0,
    toScore(revisedScore) ?? 0,
  );

  const { data: mastery, error } = await supabase
    .from("concept_mastery")
    .upsert(
      {
        concept_id: conceptId,
        explain_score: nextExplainScore,
        improve_score: nextImproveScore,
        last_practiced_at: new Date().toISOString(),
        status: strongerStatus(
          currentMastery?.status,
          revisionStatus(revisedScore, improvementScore),
        ),
        user_id: userId,
      },
      { onConflict: "user_id,concept_id" },
    )
    .select(masteryColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mastery;
}

export function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item)) as Json;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJson(item)]),
    ) as Json;
  }

  return null;
}
