import { NextResponse } from "next/server";
import {
  extractPerformanceIndicatorsFromText,
  generateCurriculumDraft,
  MAX_CURRICULUM_DRAFT_PIS,
  MAX_DRAFT_MODULES,
  MAX_QUESTIONS_PER_CONCEPT,
  CurriculumDraftError,
} from "@/lib/ai/generation/curriculum-drafts";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database, Json, LadderStage, QuestionType } from "@/lib/types";

export const runtime = "nodejs";

type DraftRequest = {
  admin_notes?: unknown;
  cluster?: unknown;
  coverage_mode?: unknown;
  desired_module_count?: unknown;
  difficulty?: unknown;
  event_id?: unknown;
  pasted_performance_indicators?: unknown;
  questions_per_concept?: unknown;
  selected_performance_indicator_ids?: unknown;
  source_type?: unknown;
  target_key_set_id?: unknown;
};
type CurriculumDraftItemInsert = Database["public"]["Tables"]["curriculum_draft_items"]["Insert"];

const eventColumns = "id,code,name,cluster";
const keySetColumns = "id,event_id,title,status";
const conceptColumns = "id,name,cluster,status";

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  const safeValue = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;

  return Math.min(max, Math.max(min, safeValue));
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function json(value: unknown): Json {
  return value as Json;
}

function jsonError(message: string, status: number, code = "curriculum_draft_error", extra = {}) {
  return NextResponse.json({ error: { code, message, ...extra }, ok: false }, { status });
}

function normalizeQuestionType(value: string): QuestionType {
  if (
    value === "multiple_choice" ||
    value === "multiple_select" ||
    value === "matching" ||
    value === "free_text"
  ) {
    return value;
  }

  return "free_text";
}

function normalizeLadderStage(value: string): LadderStage {
  if (
    value === "recognize" ||
    value === "define" ||
    value === "connect" ||
    value === "apply" ||
    value === "explain" ||
    value === "improve"
  ) {
    return value;
  }

  return "apply";
}

function normalizeQuestionPayload(question: {
  choices?: unknown;
  correctAnswer?: unknown;
  questionType: string;
  sampleStrongAnswer?: string | null;
}) {
  const questionType = normalizeQuestionType(question.questionType);

  if (questionType === "multiple_choice") {
    const choices = Array.isArray(question.choices)
      ? question.choices.filter((choice): choice is string => typeof choice === "string" && choice.trim().length > 0)
      : [];
    const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer.trim() : "";

    if (choices.length >= 2 && correctAnswer && choices.includes(correctAnswer)) {
      return { choices: json(choices), correctAnswer: json(correctAnswer), questionType };
    }
  }

  if (questionType === "multiple_select") {
    const choices = Array.isArray(question.choices)
      ? question.choices.filter((choice): choice is string => typeof choice === "string" && choice.trim().length > 0)
      : [];
    const answers = Array.isArray(question.correctAnswer)
      ? question.correctAnswer.filter((answer): answer is string => typeof answer === "string" && choices.includes(answer))
      : [];

    if (choices.length >= 2 && answers.length > 0) {
      return { choices: json(choices), correctAnswer: json(answers), questionType };
    }
  }

  if (questionType === "matching") {
    const choices =
      question.choices && typeof question.choices === "object" && !Array.isArray(question.choices)
        ? (question.choices as Record<string, unknown>)
        : {};
    const pairs = Array.isArray(choices.pairs) ? choices.pairs : [];
    const correctAnswer =
      question.correctAnswer && typeof question.correctAnswer === "object" && !Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : null;

    if (pairs.length > 0 && correctAnswer) {
      return { choices: json({ pairs }), correctAnswer: json(correctAnswer), questionType };
    }
  }

  return {
    choices: null,
    correctAnswer: json(question.sampleStrongAnswer ?? (typeof question.correctAnswer === "string" ? question.correctAnswer : null)),
    questionType: "free_text" as const,
  };
}

async function loadPerformanceIndicators(payload: DraftRequest) {
  const sourceType = text(payload.source_type);

  if (sourceType === "manual_paste") {
    const pasted = Array.isArray(payload.pasted_performance_indicators)
      ? payload.pasted_performance_indicators
          .filter((indicator): indicator is string => typeof indicator === "string")
          .join("\n")
      : text(payload.pasted_performance_indicators);
    const indicators = extractPerformanceIndicatorsFromText(pasted ?? "");

    return indicators;
  }

  if (sourceType === "extracted_pi") {
    const ids = Array.isArray(payload.selected_performance_indicator_ids)
      ? payload.selected_performance_indicator_ids.filter((id): id is string => isUuid(id))
      : [];

    if (ids.length === 0) {
      return [];
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("roleplay_performance_indicators")
      .select("id,text,status")
      .in("id", ids)
      .eq("status", "approved");

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((indicator) => indicator.text).filter(Boolean);
  }

  return [];
}

export async function POST(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return jsonError(authError ?? "Admin access required.", user ? 403 : 401, user ? "forbidden" : "unauthorized");
  }

  let payload: DraftRequest;

  try {
    payload = (await request.json()) as DraftRequest;
  } catch {
    return jsonError("Request body must be valid JSON.", 400, "invalid_json");
  }

  const sourceType = text(payload.source_type);
  if (sourceType !== "manual_paste" && sourceType !== "extracted_pi") {
    return jsonError("Choose manual pasted PIs or existing approved PIs as the source.", 400, "invalid_source_type");
  }

  const supabase = getSupabaseAdminClient();
  const eventId = isUuid(payload.event_id) ? (payload.event_id as string) : null;
  const targetKeySetId = isUuid(payload.target_key_set_id) ? (payload.target_key_set_id as string) : null;
  const requestedCluster = text(payload.cluster);
  let event: { id: string; code: string; name: string; cluster: string | null } | null = null;

  if (!eventId) {
    return jsonError("Choose the event/pathway that should receive the drafted module.", 400, "missing_event");
  }

  if (eventId) {
    const { data, error } = await supabase.from("events").select(eventColumns).eq("id", eventId).maybeSingle();

    if (error) {
      return jsonError(error.message, 500, "event_lookup_failed");
    }

    event = data;
  }

  const cluster = requestedCluster ?? event?.cluster;
  if (!cluster) {
    return jsonError("Cluster is required when no event with cluster metadata is selected.", 400, "missing_cluster");
  }

  const performanceIndicators = Array.from(new Set(await loadPerformanceIndicators(payload))).slice(0, MAX_CURRICULUM_DRAFT_PIS);

  if (performanceIndicators.length === 0) {
    return jsonError("Choose or paste at least one performance indicator.", 400, "missing_performance_indicators");
  }

  const coverageMode =
    payload.coverage_mode === "fill_gaps" ||
    payload.coverage_mode === "expand_existing_module" ||
    payload.coverage_mode === "create_new_module"
      ? payload.coverage_mode
      : "create_new_module";
  const questionsPerConcept = integer(payload.questions_per_concept, 3, 1, MAX_QUESTIONS_PER_CONCEPT);
  const desiredModuleCount = integer(payload.desired_module_count, 1, 1, MAX_DRAFT_MODULES);
  const difficulty =
    payload.difficulty === "beginner" ||
    payload.difficulty === "intermediate" ||
    payload.difficulty === "advanced"
      ? payload.difficulty
      : "intermediate";

  const { data: job, error: jobError } = await supabase
    .from("curriculum_draft_jobs")
    .insert({
      cluster,
      created_by: user.id,
      event_id: eventId,
      selected_performance_indicators: performanceIndicators,
      source_metadata: {
        coverage_mode: coverageMode,
        desired_module_count: desiredModuleCount,
        questions_per_concept: questionsPerConcept,
        target_key_set_id: targetKeySetId,
      },
      source_type: sourceType,
      status: "generating",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return jsonError(jobError?.message ?? "Unable to create curriculum draft job.", 500, "job_create_failed");
  }

  try {
    const [keySetsResult, conceptsResult, targetKeySetResult] = await Promise.all([
      eventId
        ? supabase.from("key_sets").select(keySetColumns).eq("event_id", eventId)
        : supabase.from("key_sets").select(keySetColumns).limit(50),
      supabase.from("concepts").select(conceptColumns).eq("status", "approved").limit(100),
      targetKeySetId
        ? supabase.from("key_sets").select("id,title").eq("id", targetKeySetId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const lookupError = keySetsResult.error ?? conceptsResult.error ?? targetKeySetResult.error;
    if (lookupError) {
      throw new Error(lookupError.message);
    }

    const generated = await generateCurriculumDraft({
      adminNotes: text(payload.admin_notes),
      cluster,
      coverageMode,
      desiredDifficulty: difficulty,
      desiredModuleCount,
      eventCode: event?.code ?? null,
      eventName: event?.name ?? null,
      existingConcepts: (conceptsResult.data ?? []).map((concept) => concept.name),
      existingKeySets: (keySetsResult.data ?? []).map((keySet) => keySet.title),
      performanceIndicators,
      questionsPerConcept,
      targetKeySetTitle: targetKeySetResult.data?.title ?? null,
    });

    const created = {
      concepts: [] as string[],
      keySets: [] as string[],
      questions: [] as string[],
    };
    const draftItems: CurriculumDraftItemInsert[] = [];

    for (const [moduleIndex, moduleDraft] of generated.draft.modules.slice(0, MAX_DRAFT_MODULES).entries()) {
      let keySetId = targetKeySetId;

      if (!keySetId || coverageMode === "create_new_module") {
        const { data: keySet, error } = await supabase
          .from("key_sets")
          .insert({
            ai_generated: true,
            admin_reviewed: false,
            curriculum_draft_job_id: job.id,
            description: moduleDraft.description,
            event_id: eventId,
            sort_order: 9000 + moduleIndex,
            source_performance_indicators: moduleDraft.performanceIndicators,
            status: "draft",
            title: moduleDraft.title,
          })
          .select("id")
          .single();

        if (error || !keySet) {
          throw new Error(error?.message ?? "Unable to create draft module.");
        }

        keySetId = keySet.id;
        created.keySets.push(keySet.id);
        draftItems.push({
          body: moduleDraft as unknown as Json,
          created_record_id: keySet.id,
          item_type: "key_set",
          job_id: job.id,
          source_performance_indicators: moduleDraft.performanceIndicators,
          status: "draft",
          title: moduleDraft.title,
        });
      }

      for (const [conceptIndex, conceptDraft] of moduleDraft.concepts.entries()) {
        const slug = `${slugify(conceptDraft.name)}-${Date.now().toString(36)}-${conceptIndex}`;
        const { data: concept, error } = await supabase
          .from("concepts")
          .insert({
            ai_generated: true,
            admin_reviewed: false,
            cluster,
            common_misconceptions: conceptDraft.commonMisconceptions.join("\n"),
            curriculum_draft_job_id: job.id,
            detailed_explanation: conceptDraft.detailedExplanation,
            example: conceptDraft.example,
            instructional_area: moduleDraft.instructionalArea,
            name: conceptDraft.name,
            slug,
            source_performance_indicators: conceptDraft.sourcePerformanceIndicators,
            status: "draft",
            student_friendly_definition: conceptDraft.studentFriendlyDefinition,
          })
          .select("id")
          .single();

        if (error || !concept) {
          throw new Error(error?.message ?? "Unable to create draft concept.");
        }

        created.concepts.push(concept.id);
        draftItems.push({
          body: conceptDraft as unknown as Json,
          created_record_id: concept.id,
          item_type: "concept",
          job_id: job.id,
          proposed_key_set_id: keySetId,
          source_performance_indicators: conceptDraft.sourcePerformanceIndicators,
          status: "draft",
          title: conceptDraft.name,
        });

        if (keySetId) {
          const { error: linkError } = await supabase.from("key_set_concepts").insert({
            concept_id: concept.id,
            key_set_id: keySetId,
            sort_order: conceptIndex + 1,
          });

          if (linkError) {
            throw new Error(linkError.message);
          }
        }

        for (const questionDraft of conceptDraft.questions.slice(0, questionsPerConcept)) {
          const normalized = normalizeQuestionPayload(questionDraft);
          const prompt = questionDraft.scenarioContext
            ? `Scenario: ${questionDraft.scenarioContext}\n\n${questionDraft.prompt}`
            : questionDraft.prompt;
          const { data: question, error: questionError } = await supabase
            .from("questions")
            .insert({
              ai_extracted: false,
              ai_generated: true,
              admin_reviewed: false,
              choices: normalized.choices,
              concept_id: concept.id,
              correct_answer: normalized.correctAnswer,
              curriculum_draft_job_id: job.id,
              difficulty: questionDraft.difficulty,
              event_id: eventId,
              explanation: questionDraft.explanation,
              ladder_stage: normalizeLadderStage(questionDraft.ladderStage),
              prompt,
              question_type: normalized.questionType,
              source_performance_indicators: questionDraft.sourcePerformanceIndicators,
              status: "needs_review",
            })
            .select("id")
            .single();

          if (questionError || !question) {
            throw new Error(questionError?.message ?? "Unable to create draft question.");
          }

          created.questions.push(question.id);
          draftItems.push({
            body: questionDraft as unknown as Json,
            created_record_id: question.id,
            item_type: "question",
            job_id: job.id,
            proposed_concept_id: concept.id,
            proposed_key_set_id: keySetId,
            source_performance_indicators: questionDraft.sourcePerformanceIndicators,
            status: "needs_review",
            title: questionDraft.prompt.slice(0, 120),
          });
        }
      }
    }

    if (draftItems.length > 0) {
      const { error: itemError } = await supabase.from("curriculum_draft_items").insert(draftItems);

      if (itemError) {
        throw new Error(itemError.message);
      }
    }

    const summary = {
      coveredPerformanceIndicators: generated.draft.coverageSummary.coveredPerformanceIndicators,
      missingOrSkippedPerformanceIndicators: generated.draft.coverageSummary.missingOrSkippedPerformanceIndicators,
      model: generated.model,
      modulesDrafted: created.keySets.length || generated.draft.modules.length,
      notes: generated.draft.coverageSummary.notes,
      questionsDrafted: created.questions.length,
    };

    await supabase
      .from("curriculum_draft_jobs")
      .update({
        generated_summary: summary,
        status: "completed",
      })
      .eq("id", job.id);

    return NextResponse.json({
      created,
      jobId: job.id,
      ok: true,
      summary,
    });
  } catch (error) {
    const draftError =
      error instanceof CurriculumDraftError
        ? error
        : new CurriculumDraftError(
            "gemini_api_error",
            error instanceof Error ? error.message : "Curriculum drafting failed.",
          );

    await supabase
      .from("curriculum_draft_jobs")
      .update({
        error_message: draftError.message,
        generated_summary: {
          code: draftError.code,
          retryAfterSeconds: draftError.retryAfterSeconds ?? null,
        },
        status: "failed",
      })
      .eq("id", job.id);

    return jsonError(draftError.message, 400, draftError.code, {
      jobId: job.id,
      retryAfterSeconds: draftError.retryAfterSeconds,
    });
  }
}
