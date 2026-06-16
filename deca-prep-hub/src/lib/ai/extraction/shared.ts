import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateStructuredGeminiJson,
  GeminiInfrastructureError,
  DEFAULT_GEMINI_MODEL,
  getGeminiTimeoutMs,
} from "@/lib/ai/gemini/client";
import {
  extractPdfTextFromBuffer,
  PdfTextExtractionError,
} from "@/lib/pdf/server-text-extraction";
import {
  matchEventFromGeminiExtraction,
  matchEventFromResourceMetadata,
} from "@/lib/services/event-matching";
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
import type { TextPreparationDiagnostics } from "./text-prep";

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
  diagnostics?: TextPreparationDiagnostics;
  duplicate?: boolean;
  extractionType: ResourceExtractionType;
  jobId: string | null;
  recordsCreated: Record<string, number>;
  resourceId: string;
  status: AiExtractionJobStatus | "skipped";
  warnings: string[];
  message?: string;
  retryAfterSeconds?: number;
};

export type ResourceExtractionOptions = {
  chunkSize?: number;
  chunkThreshold?: number;
  force?: boolean;
  supabase?: SupabaseAdminClient;
  userId?: string | null;
};

export type ResourceExtractionErrorCode =
  | "duplicate_extraction"
  | "gemini_api_error"
  | "gemini_invalid_response"
  | "gemini_missing_key"
  | "gemini_quota_exceeded"
  | "gemini_timeout"
  | "job_create_failed"
  | "pdf_text_extraction_failed"
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
  retryAfterSeconds?: number;

  constructor(
    code: ResourceExtractionErrorCode,
    message: string,
    jobId?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ResourceExtractionError";
    this.code = code;
    this.jobId = jobId;
    this.retryAfterSeconds = retryAfterSeconds;
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
  if (
    error instanceof GeminiInfrastructureError &&
    error.code === "quota_exceeded"
  ) {
    return "Gemini quota limit reached.";
  }

  if (
    error instanceof ResourceExtractionError &&
    error.code === "gemini_quota_exceeded"
  ) {
    return "Gemini quota limit reached.";
  }

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

    if (error.code === "quota_exceeded") {
      return "gemini_quota_exceeded";
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

export function getRetryAfterSeconds(error: unknown) {
  if (
    error instanceof GeminiInfrastructureError ||
    error instanceof ResourceExtractionError
  ) {
    return error.retryAfterSeconds;
  }

  return undefined;
}

export function isQuotaExceededError(error: unknown) {
  return getFailureCode(error) === "gemini_quota_exceeded";
}

export function buildInputMetadata({
  diagnostics,
  extractionType,
  resource,
  textSource,
}: {
  diagnostics?: TextPreparationDiagnostics;
  extractionType: ResourceExtractionType;
  resource: ExtractionResource;
  textSource: string;
}) {
  return {
    chunk_count: diagnostics?.chunkCount ?? null,
    chunk_size: diagnostics?.chunkSize ?? null,
    development_limit_applied: diagnostics?.developmentLimitApplied ?? null,
    development_max_chunks: diagnostics?.developmentMaxChunks ?? null,
    development_max_extraction_chars: diagnostics?.developmentMaxExtractionChars ?? null,
    exam_answer_key_section_trimmed: diagnostics?.answerKeySectionTrimmed ?? null,
    extraction_type: extractionType,
    extraction_strategy: diagnostics?.strategy ?? null,
    extraction_version: 1,
    gemini_model: DEFAULT_GEMINI_MODEL,
    gemini_timeout_ms: getGeminiTimeoutMs(),
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
    original_text_char_count: diagnostics?.originalTextCharCount ?? null,
    removed_trailing_text_char_count: diagnostics?.removedTrailingTextCharCount ?? null,
    text_char_count: diagnostics?.textCharCount ?? null,
    text_token_estimate: diagnostics?.tokenEstimate ?? null,
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
  let text: string;

  try {
    text = (await extractPdfTextFromBuffer(buffer)).text.trim();
  } catch (error) {
    throw new ResourceExtractionError(
      "pdf_text_extraction_failed",
      error instanceof PdfTextExtractionError
        ? error.message
        : `PDF text extraction failed: ${getErrorMessage(error)}`,
    );
  }

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

export async function updateExtractionJobInputMetadata({
  inputMetadata,
  jobId,
  supabase,
}: {
  inputMetadata: Json;
  jobId: string;
  supabase: SupabaseAdminClient;
}) {
  const { error } = await supabase
    .from("ai_extraction_jobs")
    .update({ input_metadata: inputMetadata })
    .eq("id", jobId);

  if (error) {
    throw new ResourceExtractionError("supabase_update_failed", error.message, jobId);
  }
}

export async function updateExtractionJobDiagnostics({
  diagnostics,
  jobId,
  supabase,
  textSource,
}: {
  diagnostics: TextPreparationDiagnostics;
  jobId: string;
  supabase: SupabaseAdminClient;
  textSource: string;
}) {
  const { data: job, error: selectError } = await supabase
    .from("ai_extraction_jobs")
    .select("input_metadata")
    .eq("id", jobId)
    .single();

  if (selectError || !job) {
    throw new ResourceExtractionError(
      "supabase_update_failed",
      selectError?.message ?? "Unable to load extraction job metadata.",
      jobId,
    );
  }

  const currentMetadata =
    typeof job.input_metadata === "object" && job.input_metadata !== null
      ? job.input_metadata
      : {};

  await updateExtractionJobInputMetadata({
    inputMetadata: toJson({
      ...currentMetadata,
      chunk_count: diagnostics.chunkCount,
      chunk_size: diagnostics.chunkSize,
      development_limit_applied: diagnostics.developmentLimitApplied ?? null,
      development_max_chunks: diagnostics.developmentMaxChunks ?? null,
      development_max_extraction_chars: diagnostics.developmentMaxExtractionChars ?? null,
      exam_answer_key_section_trimmed: diagnostics.answerKeySectionTrimmed ?? null,
      extraction_strategy: diagnostics.strategy,
      gemini_model: DEFAULT_GEMINI_MODEL,
      gemini_timeout_ms: getGeminiTimeoutMs(),
      original_text_char_count: diagnostics.originalTextCharCount ?? null,
      removed_trailing_text_char_count: diagnostics.removedTrailingTextCharCount ?? null,
      text_char_count: diagnostics.textCharCount,
      text_source: textSource,
      text_token_estimate: diagnostics.tokenEstimate,
    }),
    jobId,
    supabase,
  });
}

export async function prepareResourceExtraction({
  extractionType,
  resourceId,
  supabase,
  userId = null,
}: {
  extractionType: ResourceExtractionType;
  resourceId: string;
  supabase: SupabaseAdminClient;
  userId?: string | null;
}) {
  const resource = await loadResourceForExtraction(resourceId, supabase);
  const initialInputMetadata = toJson(
    buildInputMetadata({
      extractionType,
      resource,
      textSource: "pending_text_extraction",
    }),
  );
  const jobId = await createExtractionJob({
    extractionType,
    inputMetadata: initialInputMetadata,
    resource,
    supabase,
    userId,
  });

  try {
    const { text, textSource } = await getResourceExtractionText(resource, supabase);
    const inputMetadata = toJson(buildInputMetadata({ extractionType, resource, textSource }));

    await updateExtractionJobInputMetadata({ inputMetadata, jobId, supabase });

    return {
      inputMetadata,
      jobId,
      resource,
      text,
      textSource,
    };
  } catch (error) {
    const normalizedError =
      error instanceof ResourceExtractionError
        ? error
        : new ResourceExtractionError(
            "pdf_text_extraction_failed",
            `PDF text extraction failed: ${getErrorMessage(error)}`,
            jobId,
          );

    if (!normalizedError.jobId) {
      normalizedError.jobId = jobId;
    }

    await markExtractionJobFailed({
      error: normalizedError,
      jobId,
      rawOutputJson: null,
      supabase,
    });

    throw normalizedError;
  }
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

export async function mergeExtractionJobInputMetadata({
  jobId,
  metadata,
  supabase,
}: {
  jobId: string;
  metadata: Record<string, unknown>;
  supabase: SupabaseAdminClient;
}) {
  const { data: job, error: selectError } = await supabase
    .from("ai_extraction_jobs")
    .select("input_metadata")
    .eq("id", jobId)
    .single();

  if (selectError || !job) {
    throw new ResourceExtractionError(
      "supabase_update_failed",
      selectError?.message ?? "Unable to load extraction job metadata.",
      jobId,
    );
  }

  const currentMetadata =
    typeof job.input_metadata === "object" && job.input_metadata !== null
      ? job.input_metadata
      : {};

  await updateExtractionJobInputMetadata({
    inputMetadata: toJson({
      ...currentMetadata,
      ...metadata,
    }),
    jobId,
    supabase,
  });
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
  maxAttempts = 2,
  prompt,
  markValidationFailure = true,
  responseJsonSchema,
  schema,
  supabase,
  timeoutMs = getGeminiTimeoutMs(),
}: {
  jobId: string;
  maxAttempts?: number;
  markValidationFailure?: boolean;
  prompt: string;
  responseJsonSchema: unknown;
  schema: z.ZodType<T>;
  supabase: SupabaseAdminClient;
  timeoutMs?: number;
}) {
  let generated: Awaited<ReturnType<typeof generateStructuredGeminiJsonWithRetry>>;

  try {
    generated = await generateStructuredGeminiJsonWithRetry({
      jobId,
      maxAttempts,
      prompt,
      responseJsonSchema,
      timeoutMs,
    });
  } catch (error) {
    if (error instanceof GeminiInfrastructureError) {
      throw new ResourceExtractionError(
        getFailureCode(error),
        getErrorMessage(error),
        jobId,
        error.retryAfterSeconds,
      );
    }

    throw error;
  }
  const validation = validateWithSchema(schema, generated.rawJson);

  if (!validation.ok) {
      const validationError = new ResourceExtractionError(
      "schema_validation_failed",
      validation.errorMessage,
      jobId,
    );
    if (markValidationFailure) {
      await markExtractionJobFailed({
        error: validationError,
        jobId,
        rawOutputJson: toJson(generated.rawJson),
        supabase,
      });
    }
    throw validationError;
  }

  return {
    generated,
    result: validation.data,
  };
}

function isRetryableGeminiError(error: unknown) {
  if (!(error instanceof GeminiInfrastructureError) || error.code !== "api_error") {
    return false;
  }

  return /503|UNAVAILABLE|high demand|temporarily unavailable/i.test(error.message);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function generateStructuredGeminiJsonWithRetry({
  jobId,
  maxAttempts,
  prompt,
  responseJsonSchema,
  timeoutMs,
}: {
  jobId: string;
  maxAttempts: number;
  prompt: string;
  responseJsonSchema: unknown;
  timeoutMs: number;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      return await generateStructuredGeminiJson({
        prompt,
        responseJsonSchema,
        timeoutMs,
      });
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryableGeminiError(error)) {
        throw error;
      }

      console.warn("[ai extract] retrying Gemini request", {
        attempt,
        code: error instanceof GeminiInfrastructureError ? error.code : "unknown",
        job_id: jobId,
      });
      await sleep(1500 * attempt);
    }
  }

  throw lastError;
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

export async function resolveCanonicalEventId({
  detectedEventCode,
  detectedEventName,
  resource,
  supabase,
}: {
  detectedEventCode?: string | null;
  detectedEventName?: string | null;
  resource: ExtractionResource;
  supabase: SupabaseAdminClient;
}) {
  const event = detectedEventCode || detectedEventName
    ? await matchEventFromGeminiExtraction(
        supabase,
        {
          detectedEventCode,
          detectedEventName,
        },
        resource,
      )
    : await matchEventFromResourceMetadata(supabase, resource);

  return event?.id ?? null;
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
