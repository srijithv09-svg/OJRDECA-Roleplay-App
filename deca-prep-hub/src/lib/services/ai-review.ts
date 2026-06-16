"use client";

import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AiExtractedAnswerKey,
  AiExtractionJob,
  Concept,
  DecaEvent,
  Json,
  ResourceListItem,
  ReviewableContentStatus,
  RoleplayPerformanceIndicator,
  RoleplayScenario,
  Rubric,
  RubricCriterion,
  StructuredQuestion,
} from "@/lib/types";

export type ReviewStatusFilter = "all" | ReviewableContentStatus;
export type JobStatusFilter = "all" | AiExtractionJob["status"];

export type ResourceLookup = Pick<
  ResourceListItem,
  "id" | "original_filename" | "resource_type" | "title" | "year"
>;

export type AiReviewData = {
  answerKeys: AiExtractedAnswerKey[];
  concepts: Concept[];
  events: DecaEvent[];
  jobs: AiExtractionJob[];
  questions: StructuredQuestion[];
  resources: ResourceLookup[];
  roleplayPerformanceIndicators: RoleplayPerformanceIndicator[];
  roleplays: RoleplayScenario[];
  rubricCriteria: RubricCriterion[];
  rubrics: Rubric[];
};

export type AiReviewJobDetail = AiReviewData & {
  job: AiExtractionJob | null;
};

export type QuestionReviewUpdate = Partial<
  Pick<
    StructuredQuestion,
    | "choices"
    | "concept_id"
    | "correct_answer"
    | "difficulty"
    | "event_id"
    | "explanation"
    | "ladder_stage"
    | "prompt"
    | "question_type"
    | "status"
  >
>;

export type RoleplayReviewUpdate = Partial<
  Pick<
    RoleplayScenario,
    | "business_context"
    | "event_id"
    | "instructional_area"
    | "judge_role"
    | "participant_role"
    | "performance_indicators"
    | "scenario_text"
    | "status"
    | "task"
    | "title"
  >
>;

export type RoleplayPerformanceIndicatorReviewUpdate = Partial<
  Pick<
    RoleplayPerformanceIndicator,
    | "confidence"
    | "event_id"
    | "instructional_area"
    | "possible_concepts"
    | "resource_id"
    | "sort_order"
    | "status"
    | "text"
  >
>;

export type RoleplayPerformanceIndicatorInput = Pick<
  RoleplayPerformanceIndicator,
  "text"
> &
  Partial<
    Pick<
      RoleplayPerformanceIndicator,
      "confidence" | "instructional_area" | "possible_concepts" | "status"
    >
  >;

export type AnswerKeyReviewUpdate = Partial<
  Pick<
    AiExtractedAnswerKey,
    | "answers"
    | "detected_event_code"
    | "detected_year"
    | "possible_exam_resource_id"
    | "status"
    | "title"
  >
>;

export type RubricReviewUpdate = Partial<
  Pick<Rubric, "event_id" | "rubric_type" | "status" | "title">
> & {
  criteria?: Array<
    Pick<
      RubricCriterion,
      "description" | "id" | "max_points" | "name" | "performance_levels" | "sort_order"
    >
  >;
};

const extractionJobColumns =
  "id,resource_id,user_id,job_type,status,model,input_storage_path,input_metadata,raw_output_json,validated_output_json,confidence_score,error_message,started_at,completed_at,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const roleplayColumns =
  "id,resource_id,event_id,title,scenario_text,participant_role,judge_role,business_context,task,instructional_area,performance_indicators,status,ai_extracted,admin_reviewed,created_at,updated_at";
const roleplayPerformanceIndicatorColumns =
  "id,roleplay_scenario_id,resource_id,event_id,text,instructional_area,possible_concepts,confidence,sort_order,status,ai_extracted,admin_reviewed,created_at,updated_at";
const answerKeyColumns =
  "id,resource_id,ai_extraction_job_id,possible_exam_resource_id,title,detected_event_code,detected_year,answers,status,admin_reviewed,created_at,updated_at";
const rubricColumns =
  "id,resource_id,event_id,ai_extraction_job_id,title,rubric_type,status,ai_extracted,admin_reviewed,created_at,updated_at";
const rubricCriteriaColumns =
  "id,rubric_id,name,description,max_points,performance_levels,sort_order,created_at,updated_at";
const resourceColumns = "id,title,resource_type,original_filename,year";
const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,created_at,updated_at";

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? "You must be signed in as an admin or advisor.");
  }

  return data.session.access_token;
}

async function fetchReviewMutation<T>(payload: unknown): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/ai/review", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(responsePayload.error ?? "Unable to update AI review item.");
  }

  return responsePayload;
}

async function fetchReviewCreate<T>(payload: unknown): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/ai/review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(responsePayload.error ?? "Unable to create AI review item.");
  }

  return responsePayload;
}

async function loadAiReviewData(): Promise<AiReviewData> {
  const supabase = getSupabaseClient();
  const [
    jobs,
    questions,
    roleplays,
    roleplayPerformanceIndicators,
    answerKeys,
    rubrics,
    rubricCriteria,
    resources,
    events,
    concepts,
  ] = await Promise.all([
    supabase.from("ai_extraction_jobs").select(extractionJobColumns).order("created_at", { ascending: false }),
    supabase.from("questions").select(questionColumns).eq("ai_extracted", true).order("created_at", { ascending: false }),
    supabase.from("roleplay_scenarios").select(roleplayColumns).eq("ai_extracted", true).order("created_at", { ascending: false }),
    supabase
      .from("roleplay_performance_indicators")
      .select(roleplayPerformanceIndicatorColumns)
      .order("sort_order", { ascending: true }),
    supabase.from("ai_extracted_answer_keys").select(answerKeyColumns).order("created_at", { ascending: false }),
    supabase.from("rubrics").select(rubricColumns).eq("ai_extracted", true).order("created_at", { ascending: false }),
    supabase.from("rubric_criteria").select(rubricCriteriaColumns).order("sort_order", { ascending: true }),
    supabase.from("resources").select(resourceColumns).order("title", { ascending: true }),
    supabase.from("events").select(eventColumns).order("sort_order", { ascending: true }),
    supabase.from("concepts").select(conceptColumns).order("name", { ascending: true }),
  ]);

  const failed = [
    jobs.error,
    questions.error,
    roleplays.error,
    roleplayPerformanceIndicators.error,
    answerKeys.error,
    rubrics.error,
    rubricCriteria.error,
    resources.error,
    events.error,
    concepts.error,
  ].find(Boolean);

  if (failed) {
    logDeveloperError("[ai review] data lookup failed", failed);
    throw new Error(getFriendlyErrorMessage(failed, "Unable to load AI review data."));
  }

  return {
    answerKeys: answerKeys.data ?? [],
    concepts: concepts.data ?? [],
    events: events.data ?? [],
    jobs: jobs.data ?? [],
    questions: questions.data ?? [],
    resources: resources.data ?? [],
    roleplays: roleplays.data ?? [],
    roleplayPerformanceIndicators: roleplayPerformanceIndicators.data ?? [],
    rubricCriteria: rubricCriteria.data ?? [],
    rubrics: rubrics.data ?? [],
  };
}

export const AiReviewService = {
  async getAiReviewData() {
    return loadAiReviewData();
  },

  async getAiExtractionJobById(id: string): Promise<AiReviewJobDetail> {
    const data = await loadAiReviewData();

    return {
      ...data,
      job: data.jobs.find((job) => job.id === id) ?? null,
    };
  },

  async updateExtractedQuestion(id: string, updates: QuestionReviewUpdate) {
    return fetchReviewMutation<{ question: StructuredQuestion }>({
      entity: "question",
      id,
      updates,
    });
  },

  async setQuestionReviewStatus(id: string, status: ReviewableContentStatus) {
    return this.updateExtractedQuestion(id, { status });
  },

  async updateExtractedRoleplayScenario(id: string, updates: RoleplayReviewUpdate) {
    return fetchReviewMutation<{ roleplay: RoleplayScenario }>({
      entity: "roleplay",
      id,
      updates,
    });
  },

  async setRoleplayScenarioReviewStatus(id: string, status: ReviewableContentStatus) {
    return this.updateExtractedRoleplayScenario(id, { status });
  },

  async updateRoleplayPerformanceIndicator(
    id: string,
    updates: RoleplayPerformanceIndicatorReviewUpdate,
  ) {
    return fetchReviewMutation<{ performanceIndicator: RoleplayPerformanceIndicator }>({
      entity: "roleplay_performance_indicator",
      id,
      updates,
    });
  },

  async setRoleplayPerformanceIndicatorStatus(id: string, status: ReviewableContentStatus) {
    return this.updateRoleplayPerformanceIndicator(id, { status });
  },

  async addRoleplayPerformanceIndicator(
    roleplayScenarioId: string,
    input: RoleplayPerformanceIndicatorInput,
  ) {
    return fetchReviewCreate<{ performanceIndicator: RoleplayPerformanceIndicator }>({
      entity: "roleplay_performance_indicator",
      input,
      roleplay_scenario_id: roleplayScenarioId,
    });
  },

  async updateExtractedAnswerKey(id: string, updates: AnswerKeyReviewUpdate) {
    return fetchReviewMutation<{ answerKey: AiExtractedAnswerKey }>({
      entity: "answer_key",
      id,
      updates,
    });
  },

  async setExtractedAnswerKeyStatus(id: string, status: ReviewableContentStatus) {
    return this.updateExtractedAnswerKey(id, { status });
  },

  async updateRubric(id: string, updates: RubricReviewUpdate) {
    return fetchReviewMutation<{ rubric: Rubric; criteria: RubricCriterion[] }>({
      entity: "rubric",
      id,
      updates,
    });
  },

  async setRubricReviewStatus(id: string, status: ReviewableContentStatus) {
    return this.updateRubric(id, { status });
  },
};

export function stringifyJson(value: Json | null | undefined) {
  return JSON.stringify(value ?? null, null, 2);
}
