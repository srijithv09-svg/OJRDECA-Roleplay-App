import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  AiExtractedAnswerKey,
  AiExtractionJob,
  Rubric,
  RubricCriterion,
  StructuredQuestion,
} from "@/lib/types";

const extractionJobColumns =
  "id,resource_id,user_id,job_type,status,model,input_storage_path,input_metadata,raw_output_json,validated_output_json,confidence_score,error_message,started_at,completed_at,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const answerKeyColumns =
  "id,resource_id,ai_extraction_job_id,possible_exam_resource_id,title,detected_event_code,detected_year,answers,status,admin_reviewed,created_at,updated_at";
const rubricColumns =
  "id,resource_id,event_id,ai_extraction_job_id,title,rubric_type,status,ai_extracted,admin_reviewed,created_at,updated_at";
const rubricCriteriaColumns =
  "id,rubric_id,name,description,max_points,performance_levels,sort_order,created_at,updated_at";

export type ExtractedRubricWithCriteria = Rubric & {
  criteria: RubricCriterion[];
};

export const AiExtractionsService = {
  async getExtractionJobsForResource(resourceId: string): Promise<AiExtractionJob[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("ai_extraction_jobs")
      .select(extractionJobColumns)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false });

    if (error) {
      logDeveloperError("[ai extractions] jobs lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load AI extraction jobs."));
    }

    return data ?? [];
  },

  async getExtractedQuestionsForResource(resourceId: string): Promise<StructuredQuestion[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("questions")
      .select(questionColumns)
      .eq("source_resource_id", resourceId)
      .eq("ai_extracted", true)
      .order("created_at", { ascending: false });

    if (error) {
      logDeveloperError("[ai extractions] questions lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load extracted questions."));
    }

    return data ?? [];
  },

  async getExtractedAnswerKeysForResource(resourceId: string): Promise<AiExtractedAnswerKey[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("ai_extracted_answer_keys")
      .select(answerKeyColumns)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false });

    if (error) {
      logDeveloperError("[ai extractions] answer key lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load extracted answer keys."));
    }

    return data ?? [];
  },

  async getExtractedRubricsForResource(resourceId: string): Promise<ExtractedRubricWithCriteria[]> {
    const supabase = getSupabaseClient();
    const { data: rubrics, error } = await supabase
      .from("rubrics")
      .select(rubricColumns)
      .eq("resource_id", resourceId)
      .eq("ai_extracted", true)
      .order("created_at", { ascending: false });

    if (error) {
      logDeveloperError("[ai extractions] rubric lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load extracted rubrics."));
    }

    const rubricRows = rubrics ?? [];

    if (rubricRows.length === 0) {
      return [];
    }

    const { data: criteria, error: criteriaError } = await supabase
      .from("rubric_criteria")
      .select(rubricCriteriaColumns)
      .in(
        "rubric_id",
        rubricRows.map((rubric) => rubric.id),
      )
      .order("sort_order", { ascending: true });

    if (criteriaError) {
      logDeveloperError("[ai extractions] rubric criteria lookup failed", criteriaError);
      throw new Error(getFriendlyErrorMessage(criteriaError, "Unable to load rubric criteria."));
    }

    const criteriaByRubricId = new Map<string, RubricCriterion[]>();

    for (const criterion of criteria ?? []) {
      criteriaByRubricId.set(criterion.rubric_id, [
        ...(criteriaByRubricId.get(criterion.rubric_id) ?? []),
        criterion,
      ]);
    }

    return rubricRows.map((rubric) => ({
      ...rubric,
      criteria: criteriaByRubricId.get(rubric.id) ?? [],
    }));
  },
};
