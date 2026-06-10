import "server-only";

import { buildAnswerKeyExtractionPrompt } from "@/lib/ai/gemini/prompts";
import {
  AnswerKeyExtractionResultSchema,
  answerKeyExtractionJsonSchema,
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
  ResourceExtractionError,
  type ExtractionSummary,
  type ResourceExtractionOptions,
  toJson,
  toPromptMetadata,
  updateExtractionJobSuccess,
} from "./shared";

async function getExistingExtractedAnswerKeyCount(
  resourceId: string,
  supabase: ReturnType<typeof getExtractionSupabase>,
) {
  const { count, error } = await supabase
    .from("ai_extracted_answer_keys")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", resourceId);

  if (error) {
    throw new ResourceExtractionError("supabase_insert_failed", error.message);
  }

  return count ?? 0;
}

export async function extractAnswerKeyFromResource(
  resourceId: string,
  { force = false, supabase = getExtractionSupabase(), userId = null }: ResourceExtractionOptions = {},
): Promise<ExtractionSummary> {
  const existingCount = await getExistingExtractedAnswerKeyCount(resourceId, supabase);

  if (existingCount > 0 && !force) {
    return {
      duplicate: true,
      extractionType: "answer_key",
      jobId: null,
      recordsCreated: { ai_extracted_answer_keys: 0 },
      resourceId,
      status: "skipped",
      warnings: [`${existingCount} AI-extracted answer key record(s) already exist for this resource.`],
      message: "Extraction skipped because a draft AI answer key already exists.",
    };
  }

  const resource = await loadResourceForExtraction(resourceId, supabase);
  const { text, textSource } = await getResourceExtractionText(resource, supabase);
  const inputMetadata = toJson(buildInputMetadata({ extractionType: "answer_key", resource, textSource }));
  const jobId = await createExtractionJob({
    extractionType: "answer_key",
    inputMetadata,
    resource,
    supabase,
    userId,
  });

  try {
    const { generated, result } = await generateAndValidateExtraction({
      jobId,
      prompt: buildAnswerKeyExtractionPrompt(toPromptMetadata(resource), text),
      responseJsonSchema: answerKeyExtractionJsonSchema,
      schema: AnswerKeyExtractionResultSchema,
      supabase,
    });
    let recordsCreated = 0;

    if (existingCount === 0) {
      const { data, error } = await supabase
        .from("ai_extracted_answer_keys")
        .insert({
          resource_id: resource.id,
          ai_extraction_job_id: jobId,
          possible_exam_resource_id: null,
          title: result.title ?? resource.title,
          detected_event_code: result.detectedEventCode ?? resource.event_code,
          detected_year: result.detectedYear ?? resource.year,
          answers: toJson(result.answers),
          status: "needs_review",
          admin_reviewed: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new ResourceExtractionError(
          "supabase_insert_failed",
          error?.message ?? "Unable to store extracted answer key.",
          jobId,
        );
      }

      recordsCreated = 1;
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
      extractionType: "answer_key",
      jobId,
      recordsCreated: { ai_extracted_answer_keys: recordsCreated },
      resourceId,
      status,
      warnings:
        force && existingCount > 0
          ? [...result.warnings, "Force run created a new job but did not duplicate the existing draft answer key."]
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
