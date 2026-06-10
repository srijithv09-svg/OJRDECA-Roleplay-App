import "server-only";

import { buildExamExtractionPrompt } from "@/lib/ai/gemini/prompts";
import {
  ExamExtractionResultSchema,
  examExtractionJsonSchema,
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

async function getExistingExtractedQuestionCount(resourceId: string, supabase: ReturnType<typeof getExtractionSupabase>) {
  const { count, error } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("source_resource_id", resourceId)
    .eq("ai_extracted", true);

  if (error) {
    throw new ResourceExtractionError("supabase_insert_failed", error.message);
  }

  return count ?? 0;
}

export async function extractExamFromResource(
  resourceId: string,
  { force = false, supabase = getExtractionSupabase(), userId = null }: ResourceExtractionOptions = {},
): Promise<ExtractionSummary> {
  const existingCount = await getExistingExtractedQuestionCount(resourceId, supabase);

  if (existingCount > 0 && !force) {
    return {
      duplicate: true,
      extractionType: "exam",
      jobId: null,
      recordsCreated: { questions: 0 },
      resourceId,
      status: "skipped",
      warnings: [`${existingCount} AI-extracted question(s) already exist for this resource.`],
      message: "Extraction skipped because draft AI questions already exist.",
    };
  }

  const resource = await loadResourceForExtraction(resourceId, supabase);
  const { text, textSource } = await getResourceExtractionText(resource, supabase);
  const inputMetadata = toJson(buildInputMetadata({ extractionType: "exam", resource, textSource }));
  const jobId = await createExtractionJob({
    extractionType: "exam",
    inputMetadata,
    resource,
    supabase,
    userId,
  });

  try {
    const { generated, result } = await generateAndValidateExtraction({
      jobId,
      prompt: buildExamExtractionPrompt(toPromptMetadata(resource), text),
      responseJsonSchema: examExtractionJsonSchema,
      schema: ExamExtractionResultSchema,
      supabase,
    });
    const eventId = await resolveEventIdByCode(
      result.detectedEventCode ?? resource.event_code,
      supabase,
    );
    let recordsCreated = 0;

    if (existingCount === 0 && result.questions.length > 0) {
      const { data, error } = await supabase
        .from("questions")
        .insert(
          result.questions.map((question) => ({
            source_resource_id: resource.id,
            event_id: eventId,
            concept_id: null,
            question_type: "multiple_choice",
            ladder_stage: "recognize",
            prompt: question.prompt,
            choices: toJson(question.choices),
            correct_answer: null,
            explanation: null,
            difficulty: question.difficulty,
            status: "needs_review",
            ai_generated: false,
            ai_extracted: true,
            admin_reviewed: false,
          })),
        )
        .select("id");

      if (error) {
        throw new ResourceExtractionError("supabase_insert_failed", error.message, jobId);
      }

      recordsCreated = data?.length ?? 0;
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
      extractionType: "exam",
      jobId,
      recordsCreated: { questions: recordsCreated },
      resourceId,
      status,
      warnings:
        force && existingCount > 0
          ? [...result.warnings, "Force run created a new job but did not duplicate existing draft questions."]
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
