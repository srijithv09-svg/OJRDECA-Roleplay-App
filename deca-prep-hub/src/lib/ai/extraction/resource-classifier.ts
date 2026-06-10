import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructuredGeminiJson, GeminiInfrastructureError } from "@/lib/ai/gemini/client";
import { buildResourceClassificationPrompt } from "@/lib/ai/gemini/prompts";
import {
  ResourceClassificationResultSchema,
  resourceClassificationJsonSchema,
  type ResourceClassificationResult,
} from "@/lib/ai/gemini/schemas";
import { validateWithSchema } from "@/lib/ai/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AiExtractionJobStatus, Database, Json, ResourceListItem } from "@/lib/types";

const classificationJobType = "resource_classification";
const highConfidenceThreshold = 0.75;
const resourceColumns =
  "id,title,cluster,event_code,event_name,event_category,instructional_area,year,resource_type,approval_status,original_filename,confidence_score,import_notes,file_path,storage_path";

type SupabaseAdminClient = SupabaseClient<Database>;

type ResourceClassificationOptions = {
  supabase?: SupabaseAdminClient;
  userId?: string | null;
  textExcerpt?: string | null;
};

type ResourceForClassification = Pick<
  ResourceListItem,
  | "cluster"
  | "event_category"
  | "event_code"
  | "event_name"
  | "id"
  | "import_notes"
  | "instructional_area"
  | "original_filename"
  | "resource_type"
  | "storage_path"
  | "title"
  | "year"
>;

export type ResourceClassificationServiceResult = {
  jobId: string;
  status: AiExtractionJobStatus;
  classificationId: string | null;
  model: string | null;
  result: ResourceClassificationResult;
};

export type ResourceClassificationErrorCode =
  | "resource_not_found"
  | "job_create_failed"
  | "gemini_missing_key"
  | "gemini_api_error"
  | "gemini_timeout"
  | "gemini_invalid_response"
  | "schema_validation_failed"
  | "supabase_update_failed"
  | "classification_insert_failed";

export class ResourceClassificationError extends Error {
  code: ResourceClassificationErrorCode;
  jobId?: string;

  constructor(code: ResourceClassificationErrorCode, message: string, jobId?: string) {
    super(message);
    this.name = "ResourceClassificationError";
    this.code = code;
    this.jobId = jobId;
  }
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function toMetadata(resource: ResourceForClassification, textExcerpt?: string | null) {
  return {
    classification_version: 1,
    resource_id: resource.id,
    title: resource.title,
    original_filename: resource.original_filename,
    resource_type: resource.resource_type,
    event_code: resource.event_code,
    event_name: resource.event_name,
    event_category: resource.event_category,
    cluster: resource.cluster,
    instructional_area: resource.instructional_area,
    year: resource.year,
    import_notes: resource.import_notes,
    text_excerpt_available: Boolean(textExcerpt?.trim()),
  };
}

function getFailureCode(error: unknown): ResourceClassificationErrorCode {
  if (error instanceof GeminiInfrastructureError) {
    if (error.code === "missing_key") {
      return "gemini_missing_key";
    }

    if (error.code === "timeout") {
      return "gemini_timeout";
    }

    if (error.code === "invalid_response") {
      return "gemini_invalid_response";
    }

    return "gemini_api_error";
  }

  if (error instanceof ResourceClassificationError) {
    return error.code;
  }

  return "gemini_api_error";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Resource classification failed.";
}

async function markJobFailed({
  error,
  jobId,
  rawOutputJson,
  supabase,
}: {
  error: unknown;
  jobId: string;
  rawOutputJson?: Json | null;
  supabase: SupabaseAdminClient;
}) {
  const { error: updateError } = await supabase
    .from("ai_extraction_jobs")
    .update({
      status: "failed",
      error_message: getErrorMessage(error),
      raw_output_json: rawOutputJson,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateError) {
    throw new ResourceClassificationError(
      "supabase_update_failed",
      updateError.message,
      jobId,
    );
  }
}

export async function classifyResourceById(
  resourceId: string,
  { supabase = getSupabaseAdminClient(), textExcerpt = null, userId = null }: ResourceClassificationOptions = {},
): Promise<ResourceClassificationServiceResult> {
  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select(resourceColumns)
    .eq("id", resourceId)
    .maybeSingle();

  if (resourceError) {
    throw new ResourceClassificationError("resource_not_found", resourceError.message);
  }

  if (!resource) {
    throw new ResourceClassificationError(
      "resource_not_found",
      `Resource ${resourceId} was not found.`,
    );
  }

  const typedResource = resource as ResourceForClassification;
  const inputMetadata = toMetadata(typedResource, textExcerpt);
  const { data: job, error: jobError } = await supabase
    .from("ai_extraction_jobs")
    .insert({
      resource_id: typedResource.id,
      user_id: userId,
      job_type: classificationJobType,
      status: "processing",
      model: process.env.GEMINI_MODEL ?? null,
      input_storage_path: typedResource.storage_path,
      input_metadata: toJson(inputMetadata),
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new ResourceClassificationError(
      "job_create_failed",
      jobError?.message ?? "Unable to create AI extraction job.",
    );
  }

  try {
    const prompt = buildResourceClassificationPrompt({
      title: typedResource.title,
      originalFilename: typedResource.original_filename,
      resourceType: typedResource.resource_type,
      eventCode: typedResource.event_code,
      eventName: typedResource.event_name,
      eventCategory: typedResource.event_category,
      cluster: typedResource.cluster,
      instructionalArea: typedResource.instructional_area,
      year: typedResource.year,
      textExcerpt,
    });
    const generated = await generateStructuredGeminiJson({
      prompt,
      responseJsonSchema: resourceClassificationJsonSchema,
    });
    const validation = validateWithSchema(ResourceClassificationResultSchema, generated.rawJson);

    if (!validation.ok) {
      const validationError = new ResourceClassificationError(
        "schema_validation_failed",
        validation.errorMessage,
        job.id,
      );
      await markJobFailed({
        error: validationError,
        jobId: job.id,
        rawOutputJson: toJson(generated.rawJson),
        supabase,
      });
      throw validationError;
    }

    const status: AiExtractionJobStatus =
      validation.data.confidence >= highConfidenceThreshold ? "completed" : "needs_review";
    const { error: updateError } = await supabase
      .from("ai_extraction_jobs")
      .update({
        status,
        model: generated.model,
        raw_output_json: toJson(generated.rawJson),
        validated_output_json: toJson(validation.data),
        confidence_score: validation.data.confidence,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (updateError) {
      throw new ResourceClassificationError(
        "supabase_update_failed",
        updateError.message,
        job.id,
      );
    }

    const { data: classification, error: classificationError } = await supabase
      .from("resource_classifications")
      .insert({
        resource_id: typedResource.id,
        ai_extraction_job_id: job.id,
        classification: validation.data.resourceType,
        confidence: validation.data.confidence,
        reasoning_summary: validation.data.reasoningSummary,
        detected_event_code: validation.data.detectedEventCode ?? null,
        detected_event_name: validation.data.detectedEventName ?? null,
        detected_year: validation.data.detectedYear ?? null,
        warnings: toJson(validation.data.warnings),
        admin_confirmed: false,
      })
      .select("id")
      .single();

    if (classificationError || !classification) {
      const insertError = new ResourceClassificationError(
        "classification_insert_failed",
        classificationError?.message ?? "Unable to store resource classification.",
        job.id,
      );
      await markJobFailed({
        error: insertError,
        jobId: job.id,
        rawOutputJson: toJson(generated.rawJson),
        supabase,
      });
      throw insertError;
    }

    return {
      jobId: job.id,
      status,
      classificationId: classification.id,
      model: generated.model,
      result: validation.data,
    };
  } catch (error) {
    if (
      error instanceof ResourceClassificationError &&
      ["schema_validation_failed", "classification_insert_failed"].includes(error.code)
    ) {
      throw error;
    }

    const rawOutputJson =
      error instanceof GeminiInfrastructureError && error.rawText
        ? toJson({ rawText: error.rawText })
        : null;
    await markJobFailed({
      error,
      jobId: job.id,
      rawOutputJson,
      supabase,
    });

    throw new ResourceClassificationError(getFailureCode(error), getErrorMessage(error), job.id);
  }
}
