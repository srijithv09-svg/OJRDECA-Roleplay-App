import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import {
  generateStructuredGeminiJson,
  GeminiInfrastructureError,
  DEFAULT_GEMINI_MODEL,
} from "@/lib/ai/gemini/client";
import { validateWithSchema } from "@/lib/ai/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  AiExtractionJobStatus,
  AiExtractionJobType,
  Database,
  Json,
  ResourceClassificationType,
  ResourceListItem,
} from "@/lib/types";
import type { z } from "zod";

export type SupabaseAdminClient = SupabaseClient<Database>;

export type ResourceExtractionType = Extract<
  ResourceClassificationType,
  "answer_key" | "exam" | "judge_rubric" | "roleplay"
>;

export const extractionJobTypeByType: Record<ResourceExtractionType, AiExtractionJobType> = {
  answer_key: "answer_key_extraction",
  exam: "exam_extraction",
  judge_rubric: "rubric_extraction",
  roleplay: "roleplay_extraction",
};

export type ExtractionResource = Pick<
  ResourceListItem,
  | "approval_status"
  | "cluster"
  | "detected_text"
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

export type ExtractionSummary = {
  duplicate?: boolean;
  extractionType: ResourceExtractionType;
  jobId: string | null;
  recordsCreated: Record<string, number>;
  resourceId: string;
  status: AiExtractionJobStatus | "skipped";
  warnings: string[];
  message?: string;
};

export type ResourceExtractionOptions = {
  force?: boolean;
  supabase?: SupabaseAdminClient;
  userId?: string | null;
};

export type ResourceExtractionErrorCode =
  | "duplicate_extraction"
  | "gemini_api_error"
  | "gemini_invalid_response"
  | "gemini_missing_key"
  | "gemini_timeout"
  | "job_create_failed"
  | "resource_not_found"
  | "schema_validation_failed"
  | "storage_download_failed"
  | "storage_text_unavailable"
  | "supabase_insert_failed"
  | "supabase_update_failed"
  | "unsupported_extraction_type";

export class ResourceExtractionError extends Error {
  code: ResourceExtractionErrorCode;
  jobId?: string;

  constructor(code: ResourceExtractionErrorCode, message: string, jobId?: string) {
    super(message);
    this.name = "ResourceExtractionError";
    this.code = code;
    this.jobId = jobId;
  }
}

const resourcesBucket = "resources";
const resourceColumns =
  "id,title,cluster,event_code,event_name,event_category,instructional_area,year,resource_type,approval_status,original_filename,confidence_score,import_notes,file_path,storage_path,detected_text";

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function getExtractionSupabase(options?: Pick<ResourceExtractionOptions, "supabase">) {
  return options?.supabase ?? getSupabaseAdminClient();
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Resource extraction failed.";
}

export function getFailureCode(error: unknown): ResourceExtractionErrorCode {
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

  if (error instanceof ResourceExtractionError) {
    return error.code;
  }

  return "gemini_api_error";
}

export function getJobStatus(overallConfidence: number): AiExtractionJobStatus {
  return overallConfidence >= 0.75 ? "completed" : "needs_review";
}

export function buildInputMetadata({
  extractionType,
  resource,
  textSource,
}: {
  extractionType: ResourceExtractionType;
  resource: ExtractionResource;
  textSource: string;
}) {
  return {
    extraction_type: extractionType,
    extraction_version: 1,
    resource_id: resource.id,
    title: resource.title,
    original_filename: resource.original_filename,
    resource_type: resource.resource_type,
    approval_status: resource.approval_status,
    event_code: resource.event_code,
    event_name: resource.event_name,
    event_category: resource.event_category,
    cluster: resource.cluster,
    instructional_area: resource.instructional_area,
    year: resource.year,
    import_notes: resource.import_notes,
    text_source: textSource,
  };
}

export function toPromptMetadata(resource: ExtractionResource) {
  return {
    approvalStatus: resource.approval_status,
    title: resource.title,
    originalFilename: resource.original_filename,
    resourceType: resource.resource_type,
    eventCode: resource.event_code,
    eventName: resource.event_name,
    eventCategory: resource.event_category,
    cluster: resource.cluster,
    instructionalArea: resource.instructional_area,
    year: resource.year,
  };
}

export async function loadResourceForExtraction(
  resourceId: string,
  supabase: SupabaseAdminClient,
) {
  const { data, error } = await supabase
    .from("resources")
    .select(resourceColumns)
    .eq("id", resourceId)
    .maybeSingle();

  if (error) {
    throw new ResourceExtractionError("resource_not_found", error.message);
  }

  if (!data) {
    throw new ResourceExtractionError("resource_not_found", `Resource ${resourceId} was not found.`);
  }

  return data as ExtractionResource;
}

async function parsePdfBuffer(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function getResourceExtractionText(
  resource: ExtractionResource,
  supabase: SupabaseAdminClient,
) {
  const detectedText = resource.detected_text?.trim();

  if (detectedText && detectedText.length >= 100) {
    return {
      text: detectedText,
      textSource: "resources.detected_text",
    };
  }

  if (!resource.storage_path) {
    throw new ResourceExtractionError(
      "storage_text_unavailable",
      "Resource has no detected text or storage path available for extraction.",
    );
  }

  const { data, error } = await supabase.storage.from(resourcesBucket).download(resource.storage_path);

  if (error || !data) {
    throw new ResourceExtractionError(
      "storage_download_failed",
      error?.message ?? "Unable to download resource PDF from private storage.",
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const text = (await parsePdfBuffer(buffer)).trim();

  if (text.length < 100) {
    throw new ResourceExtractionError(
      "storage_text_unavailable",
      "PDF text extraction did not return enough text for Gemini extraction.",
    );
  }

  return {
    text,
    textSource: "storage_pdf_parse",
  };
}

export async function createExtractionJob({
  extractionType,
  inputMetadata,
  resource,
  supabase,
  userId = null,
}: {
  extractionType: ResourceExtractionType;
  inputMetadata: Json;
  resource: ExtractionResource;
  supabase: SupabaseAdminClient;
  userId?: string | null;
}) {
  const { data, error } = await supabase
    .from("ai_extraction_jobs")
    .insert({
      resource_id: resource.id,
      user_id: userId,
      job_type: extractionJobTypeByType[extractionType],
      status: "processing",
      model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      input_storage_path: resource.storage_path,
      input_metadata: inputMetadata,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ResourceExtractionError(
      "job_create_failed",
      error?.message ?? "Unable to create AI extraction job.",
    );
  }

  return data.id;
}

export async function markExtractionJobFailed({
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
    throw new ResourceExtractionError("supabase_update_failed", updateError.message, jobId);
  }
}

export async function updateExtractionJobSuccess({
  confidenceScore,
  jobId,
  model,
  rawOutputJson,
  status,
  supabase,
  validatedOutputJson,
}: {
  confidenceScore: number;
  jobId: string;
  model: string;
  rawOutputJson: Json;
  status: AiExtractionJobStatus;
  supabase: SupabaseAdminClient;
  validatedOutputJson: Json;
}) {
  const { error } = await supabase
    .from("ai_extraction_jobs")
    .update({
      status,
      model,
      raw_output_json: rawOutputJson,
      validated_output_json: validatedOutputJson,
      confidence_score: confidenceScore,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new ResourceExtractionError("supabase_update_failed", error.message, jobId);
  }
}

export async function generateAndValidateExtraction<T>({
  jobId,
  prompt,
  responseJsonSchema,
  schema,
  supabase,
}: {
  jobId: string;
  prompt: string;
  responseJsonSchema: unknown;
  schema: z.ZodType<T>;
  supabase: SupabaseAdminClient;
}) {
  const generated = await generateStructuredGeminiJson({
    prompt,
    responseJsonSchema,
    timeoutMs: 60000,
  });
  const validation = validateWithSchema(schema, generated.rawJson);

  if (!validation.ok) {
    const validationError = new ResourceExtractionError(
      "schema_validation_failed",
      validation.errorMessage,
      jobId,
    );
    await markExtractionJobFailed({
      error: validationError,
      jobId,
      rawOutputJson: toJson(generated.rawJson),
      supabase,
    });
    throw validationError;
  }

  return {
    generated,
    result: validation.data,
  };
}

export async function resolveEventIdByCode(
  eventCode: string | null | undefined,
  supabase: SupabaseAdminClient,
) {
  if (!eventCode) {
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("code", eventCode.toUpperCase())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

export async function getLatestClassification(
  resourceId: string,
  supabase: SupabaseAdminClient,
) {
  const { data, error } = await supabase
    .from("resource_classifications")
    .select("classification,confidence,created_at")
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.classification;
}

export function getRawOutputFromError(error: unknown) {
  return error instanceof GeminiInfrastructureError && error.rawText
    ? toJson({ rawText: error.rawText })
    : null;
}
