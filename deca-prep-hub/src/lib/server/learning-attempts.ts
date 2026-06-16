import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConceptMasteryStatus,
  Database,
  Json,
  LadderStage,
  QuestionAttempt,
  StructuredQuestion,
} from "@/lib/types";

const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const attemptColumns = "id,user_id,question_id,answer,is_correct,feedback,attempt_number,created_at";

type LearningSupabase = SupabaseClient<Database>;

function normalizeAnswer(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAnswer(item)) as Json;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeAnswer(item),
      ]),
    ) as Json;
  }

  return null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).sort().join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function evaluateAnswer(question: StructuredQuestion, answer: Json) {
  if (question.correct_answer === null || question.correct_answer === undefined) {
    return null;
  }

  return stableStringify(question.correct_answer) === stableStringify(answer);
}

function stageScore(attempts: QuestionAttempt[], questions: StructuredQuestion[], stage: LadderStage) {
  const stageQuestions = questions.filter((question) => question.ladder_stage === stage);
  const keyedQuestionIds = new Set(
    stageQuestions
      .filter((question) => question.correct_answer !== null && question.correct_answer !== undefined)
      .map((question) => question.id),
  );

  if (keyedQuestionIds.size === 0) {
    return null;
  }

  const latestByQuestionId = getLatestAttemptsByQuestionId(attempts);
  const correctCount = Array.from(keyedQuestionIds).filter(
    (questionId) => latestByQuestionId.get(questionId)?.is_correct === true,
  ).length;

  return correctCount / keyedQuestionIds.size;
}

function getLatestAttemptsByQuestionId(attempts: QuestionAttempt[]) {
  const latestByQuestionId = new Map<string, QuestionAttempt>();

  for (const attempt of attempts) {
    if (!latestByQuestionId.has(attempt.question_id)) {
      latestByQuestionId.set(attempt.question_id, attempt);
    }
  }

  return latestByQuestionId;
}

function determineMasteryStatus(attempts: QuestionAttempt[], questions: StructuredQuestion[]): ConceptMasteryStatus {
  if (attempts.length === 0) {
    return "not_started";
  }

  const latestByQuestionId = getLatestAttemptsByQuestionId(attempts);
  const nonFreeTextQuestions = questions.filter((question) => question.question_type !== "free_text");
  const allNonFreeTextAnswered =
    nonFreeTextQuestions.length > 0 &&
    nonFreeTextQuestions.every((question) => latestByQuestionId.has(question.id));
  const keyedNonFreeText = nonFreeTextQuestions.filter(
    (question) => question.correct_answer !== null && question.correct_answer !== undefined,
  );
  const allKeyedCorrect =
    keyedNonFreeText.length > 0 &&
    keyedNonFreeText.every((question) => latestByQuestionId.get(question.id)?.is_correct === true);
  const hasFreeTextAttempt = questions.some(
    (question) => question.question_type === "free_text" && latestByQuestionId.has(question.id),
  );

  if (allNonFreeTextAnswered && allKeyedCorrect && hasFreeTextAttempt) {
    return "almost_mastered";
  }

  if (nonFreeTextQuestions.some((question) => latestByQuestionId.has(question.id))) {
    return "practicing";
  }

  return "learning";
}

export async function saveQuestionAttempt({
  answer,
  questionId,
  supabase,
  userId,
}: {
  answer: unknown;
  questionId: string;
  supabase: LearningSupabase;
  userId: string;
}) {
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(questionColumns)
    .eq("id", questionId)
    .eq("status", "approved")
    .maybeSingle();

  if (questionError) {
    throw new Error(questionError.message);
  }

  if (!question) {
    throw new Error("This question is not available for learning practice.");
  }

  const normalizedAnswer = normalizeAnswer(answer);
  const isCorrect = evaluateAnswer(question, normalizedAnswer);
  const { count, error: countError } = await supabase
    .from("question_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("question_id", questionId);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data: attempt, error: insertError } = await supabase
    .from("question_attempts")
    .insert({
      answer: normalizedAnswer,
      attempt_number: (count ?? 0) + 1,
      feedback: null,
      is_correct: isCorrect,
      question_id: questionId,
      user_id: userId,
    })
    .select(attemptColumns)
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const mastery = question.concept_id
    ? await recalculateConceptMastery({
        conceptId: question.concept_id,
        supabase,
        userId,
      })
    : null;

  return { attempt, isCorrect, mastery, question };
}

export async function recalculateConceptMastery({
  conceptId,
  supabase,
  userId,
}: {
  conceptId: string;
  supabase: LearningSupabase;
  userId: string;
}) {
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(questionColumns)
    .eq("concept_id", conceptId)
    .eq("status", "approved");

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: attempts, error: attemptsError } =
    questionIds.length > 0
      ? await supabase
          .from("question_attempts")
          .select(attemptColumns)
          .eq("user_id", userId)
          .in("question_id", questionIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  if (attemptsError) {
    throw new Error(attemptsError.message);
  }

  const safeAttempts = (attempts ?? []) as QuestionAttempt[];
  const safeQuestions = questions ?? [];
  const now = new Date().toISOString();
  const masteryInput = {
    apply_score: stageScore(safeAttempts, safeQuestions, "apply"),
    connect_score: stageScore(safeAttempts, safeQuestions, "connect"),
    define_score: stageScore(safeAttempts, safeQuestions, "define"),
    explain_score: safeAttempts.some((attempt) =>
      safeQuestions.some(
        (question) => question.id === attempt.question_id && question.ladder_stage === "explain",
      ),
    )
      ? 0.5
      : null,
    improve_score: null,
    last_practiced_at: now,
    recognize_score: stageScore(safeAttempts, safeQuestions, "recognize"),
    status: determineMasteryStatus(safeAttempts, safeQuestions),
  };

  const { data: mastery, error } = await supabase
    .from("concept_mastery")
    .upsert(
      {
        concept_id: conceptId,
        user_id: userId,
        ...masteryInput,
      },
      { onConflict: "user_id,concept_id" },
    )
    .select(
      "user_id,concept_id,status,recognize_score,define_score,connect_score,apply_score,explain_score,improve_score,last_practiced_at,created_at,updated_at",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mastery;
}
