import "server-only";

import { buildRubricExtractionPrompt } from "@/lib/ai/gemini/prompts";
import {
  RubricExtractionResultSchema,
  rubricExtractionJsonSchema,
} from "@/lib/ai/gemini/schemas";
import type { Json } from "@/lib/types";
import {
  buildInputMetadata,
  createExtractionJob,
  generateAndValidateExtraction,
  getExtractionSupabase,
  getErrorMessage,
  getFailureCode,
  getJobStatus,
  getRawOutputFromError,
  getResourceExtractionText,
  loadResourceForExtraction,
  markExtractionJobFailed,
  resolveEventIdByCode,
  ResourceExtractionError,
  type ExtractionSummary,
  type ResourceExtractionOptions,
  toJson,
  toPromptMetadata,
  updateExtractionJobSuccess,
} from "./shared";

async function getExistingExtractedRubricCount(
  resourceId: string,
  supabase: ReturnType<typeof getExtractionSupabase>,
) {
  const { count, error } = await supabase
    .from("rubrics")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", resourceId)
    .eq("ai_extracted", true);

  if (error) {
    throw new ResourceExtractionError("supabase_insert_failed", error.message);
  }

  return count ?? 0;
}

export async function extractRubricFromResource(
  resourceId: string,
  { force = false, supabase = getExtractionSupabase(), userId = null }: ResourceExtractionOptions = {},
): Promise<ExtractionSummary> {
  const existingCount = await getExistingExtractedRubricCount(resourceId, supabase);

  if (existingCount > 0 && !force) {
    return {
      duplicate: true,
      extractionType: "judge_rubric",
      jobId: null,
      recordsCreated: { rubrics: 0, rubric_criteria: 0 },
      resourceId,
      status: "skipped",
      warnings: [`${existingCount} AI-extracted rubric(s) already exist for this resource.`],
      message: "Extraction skipped because a draft AI rubric already exists.",
    };
  }

  const resource = await loadResourceForExtraction(resourceId, supabase);
  const { text, textSource } = await getResourceExtractionText(resource, supabase);
  const inputMetadata = toJson(
    buildInputMetadata({ extractionType: "judge_rubric", resource, textSource }),
  );
  const jobId = await createExtractionJob({
    extractionType: "judge_rubric",
    inputMetadata,
    resource,
    supabase,
    userId,
  });

  try {
    const { generated, result } = await generateAndValidateExtraction({
      jobId,
      prompt: buildRubricExtractionPrompt(toPromptMetadata(resource), text),
      responseJsonSchema: rubricExtractionJsonSchema,
      schema: RubricExtractionResultSchema,
      supabase,
    });
    const eventId = await resolveEventIdByCode(
      result.detectedEventCode ?? resource.event_code,
      supabase,
    );
    let rubricsCreated = 0;
    let criteriaCreated = 0;

    if (existingCount === 0) {
      const { data: rubric, error: rubricError } = await supabase
        .from("rubrics")
        .insert({
          resource_id: resource.id,
          event_id: eventId,
          ai_extraction_job_id: jobId,
          title: result.title ?? resource.title,
          rubric_type: result.rubricType,
          status: "needs_review",
          ai_extracted: true,
          admin_reviewed: false,
        })
        .select("id")
        .single();

      if (rubricError || !rubric) {
        throw new ResourceExtractionError(
          "supabase_insert_failed",
          rubricError?.message ?? "Unable to store extracted rubric.",
          jobId,
        );
      }

      rubricsCreated = 1;

      if (result.criteria.length > 0) {
        const { data: criteria, error: criteriaError } = await supabase
          .from("rubric_criteria")
          .insert(
            result.criteria.map((criterion, index) => ({
              rubric_id: rubric.id,
              name: criterion.name,
              description: criterion.description,
              max_points: criterion.maxPoints,
              performance_levels: toJson(criterion.performanceLevels),
              sort_order: index + 1,
            })),
          )
          .select("id");

        if (criteriaError) {
          throw new ResourceExtractionError(
            "supabase_insert_failed",
            criteriaError.message,
            jobId,
          );
        }

        criteriaCreated = criteria?.length ?? 0;
      }
    }

    const status = getJobStatus(result.overallConfidence);
    await updateExtractionJobSuccess({
      confidenceScore: result.overallConfidence,
      jobId,
      model: generated.model,
      rawOutputJson: toJson(generated.rawJson),
      status,
      supabase,
      validatedOutputJson: toJson(result),
    });

    return {
      extractionType: "judge_rubric",
      jobId,
      recordsCreated: { rubrics: rubricsCreated, rubric_criteria: criteriaCreated },
      resourceId,
      status,
      warnings:
        force && existingCount > 0
          ? [...result.warnings, "Force run created a new job but did not duplicate the existing draft rubric."]
          : result.warnings,
    };
  } catch (error) {
    await markExtractionJobFailed({
      error,
      jobId,
      rawOutputJson: getRawOutputFromError(error) as Json | null,
      supabase,
    });

    if (error instanceof ResourceExtractionError) {
      throw error;
    }

    throw new ResourceExtractionError(getFailureCode(error), getErrorMessage(error), jobId);
  }
}
