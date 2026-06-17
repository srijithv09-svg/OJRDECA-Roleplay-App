import { NextResponse } from "next/server";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  Concept,
  CurriculumDraftItem,
  CurriculumDraftJob,
  DecaEvent,
  Json,
  KeySet,
  KeySetConcept,
  LadderStage,
  LearningContentStatus,
  ReviewableContentStatus,
  RoleplayPerformanceIndicator,
  StructuredQuestion,
  StudyResource,
} from "@/lib/types";

const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const keySetColumns =
  "id,event_id,title,description,sort_order,status,source_performance_indicators,curriculum_draft_job_id,ai_generated,admin_reviewed,created_at,updated_at";
const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,source_performance_indicators,curriculum_draft_job_id,ai_generated,admin_reviewed,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,source_performance_indicators,curriculum_draft_job_id,created_at,updated_at";
const studyResourceColumns =
  "id,event_id,key_set_id,concept_id,title,description,resource_kind,url,storage_path,content,status,created_by,approved_by,approved_at,created_at,updated_at";
const roleplayPerformanceIndicatorColumns =
  "id,roleplay_scenario_id,resource_id,event_id,text,instructional_area,possible_concepts,confidence,sort_order,status,ai_extracted,admin_reviewed,created_at,updated_at";
const curriculumDraftJobColumns =
  "id,created_by,event_id,cluster,source_type,source_resource_id,source_metadata,selected_performance_indicators,status,generated_summary,error_message,created_at,updated_at";
const curriculumDraftItemColumns =
  "id,job_id,item_type,proposed_key_set_id,proposed_concept_id,created_record_id,title,body,source_performance_indicators,status,created_at";

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function json(value: unknown): Json | null {
  if (value === undefined) {
    return null;
  }

  return value as Json;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function validateQuestionPayload(questionType: string, choices: Json | null, correctAnswer: Json | null) {
  if (questionType === "multiple_choice") {
    const choiceList = stringArray(choices);
    const answer = text(correctAnswer);

    if (choiceList.length < 2) {
      throw new Error("Multiple choice questions require at least two answer choices.");
    }

    if (!answer) {
      throw new Error("Multiple choice questions require one correct answer.");
    }

    if (!choiceList.includes(answer)) {
      throw new Error("The correct answer must match one of the answer choices.");
    }
  }

  if (questionType === "multiple_select") {
    const choiceList = stringArray(choices);
    const answers = stringArray(correctAnswer);

    if (choiceList.length < 2) {
      throw new Error("Multiple select questions require at least two answer choices.");
    }

    if (answers.length === 0) {
      throw new Error("Multiple select questions require at least one correct answer.");
    }

    const invalidAnswers = answers.filter((answer) => !choiceList.includes(answer));
    if (invalidAnswers.length > 0) {
      throw new Error("Each correct answer must match one of the answer choices.");
    }
  }

  if (questionType === "matching") {
    const pairSource =
      choices && typeof choices === "object" && !Array.isArray(choices) && "pairs" in choices
        ? (choices as { pairs?: unknown }).pairs
        : null;
    const pairs = Array.isArray(pairSource) ? pairSource : [];
    const answers =
      correctAnswer && typeof correctAnswer === "object" && !Array.isArray(correctAnswer)
        ? (correctAnswer as Record<string, unknown>)
        : {};

    if (pairs.length === 0) {
      throw new Error("Matching questions require at least one matching pair.");
    }

    for (const pair of pairs) {
      const left =
        pair && typeof pair === "object" && "left" in pair ? text((pair as { left?: unknown }).left) : null;
      const options =
        pair && typeof pair === "object" && "options" in pair
          ? stringArray((pair as { options?: unknown }).options)
          : [];

      if (!left || options.length === 0) {
        throw new Error("Each matching row requires a left item and at least one right-side option.");
      }

      const answer = text(answers[left]);
      if (!answer) {
        throw new Error("Each matching row requires a correct match.");
      }

      if (!options.includes(answer)) {
        throw new Error("Each matching correct match must be included in that row's options.");
      }
    }
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validLearningStatus(value: unknown): LearningContentStatus {
  return value === "approved" || value === "archived" ? value : "draft";
}

function validLadderStage(value: unknown): LadderStage | null {
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

  return null;
}

function validReviewStatus(value: unknown): ReviewableContentStatus {
  if (
    value === "draft" ||
    value === "needs_review" ||
    value === "approved" ||
    value === "archived" ||
    value === "rejected"
  ) {
    return value;
  }

  return "draft";
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function loadContentStudioData() {
  const supabase = getSupabaseAdminClient();
  const [
    events,
    keySets,
    concepts,
    links,
    questions,
    studyResources,
    roleplayPerformanceIndicators,
    curriculumDraftJobs,
    curriculumDraftItems,
  ] = await Promise.all([
    supabase.from("events").select(eventColumns).order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("key_sets").select(keySetColumns).order("sort_order", { ascending: true }).order("title", { ascending: true }),
    supabase.from("concepts").select(conceptColumns).order("name", { ascending: true }),
    supabase.from("key_set_concepts").select("key_set_id,concept_id,sort_order").order("sort_order", { ascending: true }),
    supabase.from("questions").select(questionColumns).order("updated_at", { ascending: false }),
    supabase.from("study_resources").select(studyResourceColumns).order("updated_at", { ascending: false }),
    supabase
      .from("roleplay_performance_indicators")
      .select(roleplayPerformanceIndicatorColumns)
      .eq("status", "approved")
      .order("sort_order", { ascending: true }),
    supabase
      .from("curriculum_draft_jobs")
      .select(curriculumDraftJobColumns)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("curriculum_draft_items")
      .select(curriculumDraftItemColumns)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const firstError =
    events.error ??
    keySets.error ??
    concepts.error ??
    links.error ??
    questions.error ??
    studyResources.error ??
    roleplayPerformanceIndicators.error ??
    curriculumDraftJobs.error ??
    curriculumDraftItems.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    concepts: (concepts.data ?? []) as Concept[],
    events: (events.data ?? []) as DecaEvent[],
    keySetConcepts: (links.data ?? []) as KeySetConcept[],
    keySets: (keySets.data ?? []) as KeySet[],
    questions: (questions.data ?? []) as StructuredQuestion[],
    roleplayPerformanceIndicators: (roleplayPerformanceIndicators.data ?? []) as RoleplayPerformanceIndicator[],
    curriculumDraftJobs: (curriculumDraftJobs.data ?? []) as CurriculumDraftJob[],
    curriculumDraftItems: (curriculumDraftItems.data ?? []) as CurriculumDraftItem[],
    reviewQueue: {
      conceptsDraft: (concepts.data ?? []).filter((concept) => concept.status === "draft").length,
      keySetsDraft: (keySets.data ?? []).filter((keySet) => keySet.status === "draft").length,
      questionsNeedsReview: (questions.data ?? []).filter((question) => question.status === "needs_review").length,
      studyResourcesNeedsReview: (studyResources.data ?? []).filter((resource) => resource.status === "needs_review").length,
    },
    studyResources: (studyResources.data ?? []) as StudyResource[],
  };
}

async function saveKeySet(payload: Record<string, unknown>) {
  const eventId = text(payload.event_id);
  const title = text(payload.title);

  if (!isUuid(eventId) || !title) {
    throw new Error("Event and module title are required.");
  }

  const supabase = getSupabaseAdminClient();
  const row = {
    event_id: eventId as string,
    title,
    description: text(payload.description),
    sort_order: integer(payload.sort_order),
    status: validLearningStatus(payload.status),
  };
  const id = text(payload.id);

  if (isUuid(id)) {
    const { error } = await supabase.from("key_sets").update(row).eq("id", id as string);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("key_sets").insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

async function saveConcept(payload: Record<string, unknown>) {
  const name = text(payload.name);

  if (!name) {
    throw new Error("Concept name is required.");
  }

  const supabase = getSupabaseAdminClient();
  const explicitSlug = text(payload.slug);
  const id = text(payload.id);
  const row = {
    name,
    slug: explicitSlug ?? `${slugify(name)}-${Date.now().toString(36)}`,
    cluster: text(payload.cluster),
    instructional_area: text(payload.instructional_area),
    student_friendly_definition: text(payload.student_friendly_definition),
    detailed_explanation: text(payload.detailed_explanation),
    example: text(payload.example),
    common_misconceptions: text(payload.common_misconceptions),
    status: validLearningStatus(payload.status),
  };

  let conceptId = id;

  if (isUuid(id)) {
    const updateRow = explicitSlug ? row : { ...row, slug: undefined };
    const { error } = await supabase.from("concepts").update(updateRow).eq("id", id as string);
    if (error) {
      throw new Error(error.message);
    }
    conceptId = id;
  } else {
    const { data, error } = await supabase.from("concepts").insert(row).select("id").single();
    if (error) {
      throw new Error(error.message);
    }
    conceptId = data.id;
  }

  const keySetIdPayload = payload.key_set_ids;
  const shouldSyncKeySets = Array.isArray(keySetIdPayload);
  const keySetIds = shouldSyncKeySets
    ? keySetIdPayload.filter((value): value is string => isUuid(value))
    : [];

  if (conceptId && shouldSyncKeySets) {
    const { error: deleteError } = await supabase
      .from("key_set_concepts")
      .delete()
      .eq("concept_id", conceptId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (keySetIds.length > 0) {
      const { error: linkError } = await supabase.from("key_set_concepts").insert(
        keySetIds.map((keySetId, index) => ({
          concept_id: conceptId,
          key_set_id: keySetId,
          sort_order: index + 1,
        })),
      );

      if (linkError) {
        throw new Error(linkError.message);
      }
    }
  }
}

async function saveQuestion(payload: Record<string, unknown>) {
  const prompt = text(payload.prompt);

  if (!prompt) {
    throw new Error("Question prompt is required.");
  }

  const status = validReviewStatus(payload.status);
  const questionType = text(payload.question_type) ?? "multiple_choice";
  const choices = json(payload.choices);
  const correctAnswer = json(payload.correct_answer);

  validateQuestionPayload(questionType, choices, correctAnswer);

  const row = {
    event_id: isUuid(payload.event_id) ? (payload.event_id as string) : null,
    concept_id: isUuid(payload.concept_id) ? (payload.concept_id as string) : null,
    question_type: questionType,
    ladder_stage: validLadderStage(payload.ladder_stage),
    prompt,
    choices,
    correct_answer: correctAnswer,
    explanation: text(payload.explanation),
    difficulty: text(payload.difficulty),
    status,
    admin_reviewed: status === "approved" || status === "archived" || status === "rejected",
  };
  const supabase = getSupabaseAdminClient();
  const id = text(payload.id);

  if (isUuid(id)) {
    const { error } = await supabase.from("questions").update(row).eq("id", id as string);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("questions").insert({
    ...row,
    ai_generated: Boolean(payload.ai_generated),
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function duplicateQuestion(questionId: unknown) {
  if (!isUuid(questionId)) {
    throw new Error("A valid question id is required.");
  }
  const id = questionId as string;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("questions").select(questionColumns).eq("id", id).single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: insertError } = await supabase.from("questions").insert({
    ai_extracted: Boolean(data.ai_extracted),
    ai_generated: false,
    choices: data.choices,
    concept_id: data.concept_id,
    correct_answer: data.correct_answer,
    difficulty: data.difficulty,
    event_id: data.event_id,
    explanation: data.explanation,
    ladder_stage: data.ladder_stage,
    prompt: `${data.prompt} (copy)`,
    question_type: data.question_type,
    source_performance_indicators: data.source_performance_indicators,
    source_resource_id: data.source_resource_id,
    status: "draft",
    admin_reviewed: false,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function saveStudyResource(payload: Record<string, unknown>, userId: string) {
  const title = text(payload.title);
  const resourceKind = text(payload.resource_kind);

  if (!title || !resourceKind) {
    throw new Error("Study resource title and kind are required.");
  }

  if (resourceKind === "link" && !text(payload.url)) {
    throw new Error("Link study resources require a URL.");
  }

  const status = validReviewStatus(payload.status);
  const now = new Date().toISOString();
  const row = {
    event_id: isUuid(payload.event_id) ? (payload.event_id as string) : null,
    key_set_id: isUuid(payload.key_set_id) ? (payload.key_set_id as string) : null,
    concept_id: isUuid(payload.concept_id) ? (payload.concept_id as string) : null,
    title,
    description: text(payload.description),
    resource_kind: resourceKind,
    url: text(payload.url),
    storage_path: text(payload.storage_path),
    content: text(payload.content),
    status,
    approved_by: status === "approved" ? userId : null,
    approved_at: status === "approved" ? now : null,
  };
  const supabase = getSupabaseAdminClient();
  const id = text(payload.id);

  if (isUuid(id)) {
    const { error } = await supabase.from("study_resources").update(row).eq("id", id as string);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("study_resources").insert({
    ...row,
    created_by: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function GET(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Admin access required." }, { status: user ? 403 : 401 });
  }

  try {
    return NextResponse.json(await loadContentStudioData());
  } catch (caughtError) {
    return NextResponse.json(
      { error: caughtError instanceof Error ? caughtError.message : "Unable to load content studio." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Admin access required." }, { status: user ? 403 : 401 });
  }

  try {
    const body = (await request.json()) as { action?: string; payload?: Record<string, unknown> };
    const payload = body.payload ?? {};

    if (body.action === "saveKeySet") {
      await saveKeySet(payload);
    } else if (body.action === "saveConcept") {
      await saveConcept(payload);
    } else if (body.action === "saveQuestion") {
      await saveQuestion(payload);
    } else if (body.action === "duplicateQuestion") {
      await duplicateQuestion(payload.id);
    } else if (body.action === "saveStudyResource") {
      await saveStudyResource(payload, user.id);
    } else {
      return NextResponse.json({ error: "Unknown content studio action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: await loadContentStudioData() });
  } catch (caughtError) {
    return NextResponse.json(
      { error: caughtError instanceof Error ? caughtError.message : "Unable to save content." },
      { status: 400 },
    );
  }
}
