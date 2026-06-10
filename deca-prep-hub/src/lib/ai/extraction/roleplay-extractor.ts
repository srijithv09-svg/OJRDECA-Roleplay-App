import "server-only";

import { buildRoleplayExtractionPrompt } from "@/lib/ai/gemini/prompts";
import {
  RoleplayExtractionResultSchema,
  roleplayExtractionJsonSchema,
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

async function getExistingExtractedRoleplayCount(
  resourceId: string,
  supabase: ReturnType<typeof getExtractionSupabase>,
) {
  const { count, error } = await supabase
    .from("roleplay_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", resourceId)
    .eq("ai_extracted", true);

  if (error) {
    throw new ResourceExtractionError("supabase_insert_failed", error.message);
  }

  return count ?? 0;
}

export async function extractRoleplayFromResource(
  resourceId: string,
  { force = false, supabase = getExtractionSupabase(), userId = null }: ResourceExtractionOptions = {},
): Promise<ExtractionSummary> {
  const existingCount = await getExistingExtractedRoleplayCount(resourceId, supabase);

  if (existingCount > 0 && !force) {
    return {
      duplicate: true,
      extractionType: "roleplay",
      jobId: null,
      recordsCreated: { roleplay_scenarios: 0 },
      resourceId,
      status: "skipped",
      warnings: [`${existingCount} AI-extracted roleplay scenario(s) already exist for this resource.`],
      message: "Extraction skipped because a draft AI roleplay scenario already exists.",
    };
  }

  const resource = await loadResourceForExtraction(resourceId, supabase);
  const { text, textSource } = await getResourceExtractionText(resource, supabase);
  const inputMetadata = toJson(buildInputMetadata({ extractionType: "roleplay", resource, textSource }));
  const jobId = await createExtractionJob({
    extractionType: "roleplay",
    inputMetadata,
    resource,
    supabase,
    userId,
  });

  try {
    const { generated, result } = await generateAndValidateExtraction({
      jobId,
      prompt: buildRoleplayExtractionPrompt(toPromptMetadata(resource), text),
      responseJsonSchema: roleplayExtractionJsonSchema,
      schema: RoleplayExtractionResultSchema,
      supabase,
    });
    const eventId = await resolveEventIdByCode(
      result.detectedEventCode ?? resource.event_code,
      supabase,
    );
    let recordsCreated = 0;

    if (existingCount === 0) {
      const { data, error } = await supabase
        .from("roleplay_scenarios")
        .insert({
          resource_id: resource.id,
          event_id: eventId,
          title: result.title ?? resource.title,
          scenario_text: result.scenarioText,
          participant_role: result.participantRole,
          judge_role: result.judgeRole,
          business_context: result.businessContext,
          task: result.task,
          instructional_area: result.instructionalArea ?? resource.instructional_area,
          performance_indicators: toJson(result.performanceIndicators),
          status: "needs_review",
          ai_extracted: true,
          admin_reviewed: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new ResourceExtractionError(
          "supabase_insert_failed",
          error?.message ?? "Unable to store extracted roleplay scenario.",
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
      extractionType: "roleplay",
      jobId,
      recordsCreated: { roleplay_scenarios: recordsCreated },
      resourceId,
      status,
      warnings:
        force && existingCount > 0
          ? [...result.warnings, "Force run created a new job but did not duplicate the existing draft roleplay scenario."]
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
