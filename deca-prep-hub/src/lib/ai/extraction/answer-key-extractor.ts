import "server-only";

import {
  buildAnswerKeyChunkExtractionPrompt,
  buildAnswerKeyExtractionPrompt,
} from "@/lib/ai/gemini/prompts";
import {
  AnswerKeyExtractionResultSchema,
  answerKeyExtractionJsonSchema,
  type AnswerKeyExtractionResult,
} from "@/lib/ai/gemini/schemas";
import type { Json } from "@/lib/types";
import {
  generateAndValidateExtraction,
  getExtractionSupabase,
  getErrorMessage,
  getFailureCode,
  getJobStatus,
  getRetryAfterSeconds,
  getRawOutputFromError,
  isQuotaExceededError,
  markExtractionJobFailed,
  mergeExtractionJobInputMetadata,
  prepareResourceExtraction,
  ResourceExtractionError,
  type ExtractionSummary,
  type ResourceExtractionOptions,
  toJson,
  toPromptMetadata,
  updateExtractionJobDiagnostics,
  updateExtractionJobSuccess,
} from "./shared";
import { prepareTextForExtraction, type TextChunk } from "./text-prep";

type ExtractedAnswer = AnswerKeyExtractionResult["answers"][number];

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

function mergeAnswers(results: AnswerKeyExtractionResult[]) {
  const answerMap = new Map<number, ExtractedAnswer>();

  for (const result of results) {
    for (const answer of result.answers) {
      if (!answerMap.has(answer.questionNumber)) {
        answerMap.set(answer.questionNumber, answer);
      }
    }
  }

  return [...answerMap.values()].sort((a, b) => a.questionNumber - b.questionNumber);
}

function mergeWarnings(results: AnswerKeyExtractionResult[], chunkWarnings: string[]) {
  return [
    ...chunkWarnings,
    ...results.flatMap((result) => result.warnings),
    ...results.flatMap((result) =>
      result.answers.flatMap((answer) =>
        answer.warnings.map((warning) => `Answer ${answer.questionNumber}: ${warning}`),
      ),
    ),
  ].filter(Boolean);
}

function averageConfidence(results: AnswerKeyExtractionResult[]) {
  if (results.length === 0) {
    return 0;
  }

  return results.reduce((sum, result) => sum + result.overallConfidence, 0) / results.length;
}

function buildMergedResult({
  chunkWarnings,
  results,
}: {
  chunkWarnings: string[];
  results: AnswerKeyExtractionResult[];
}): AnswerKeyExtractionResult {
  const firstResult = results[0];

  return {
    answers: mergeAnswers(results),
    detectedCluster: firstResult?.detectedCluster ?? null,
    detectedEventCode: firstResult?.detectedEventCode ?? null,
    detectedEventName: firstResult?.detectedEventName ?? null,
    detectedYear: firstResult?.detectedYear ?? null,
    overallConfidence: averageConfidence(results),
    possibleExamTitle: firstResult?.possibleExamTitle ?? null,
    possibleExamYear: firstResult?.possibleExamYear ?? null,
    resourceType: "answer_key",
    title: firstResult?.title ?? null,
    warnings: mergeWarnings(results, chunkWarnings),
  };
}

async function extractAnswerKeyChunk({
  chunk,
  chunkCount,
  jobId,
  resource,
  supabase,
}: {
  chunk: TextChunk;
  chunkCount: number;
  jobId: string;
  resource: Parameters<typeof toPromptMetadata>[0];
  supabase: ReturnType<typeof getExtractionSupabase>;
}) {
  return generateAndValidateExtraction({
    jobId,
    markValidationFailure: false,
    prompt: buildAnswerKeyChunkExtractionPrompt({
      chunkCount,
      chunkIndex: chunk.index,
      metadata: toPromptMetadata(resource),
      text: chunk.text,
    }),
    responseJsonSchema: answerKeyExtractionJsonSchema,
    schema: AnswerKeyExtractionResultSchema,
    supabase,
  });
}

export async function extractAnswerKeyFromResource(
  resourceId: string,
  {
    chunkSize,
    chunkThreshold,
    force = false,
    supabase = getExtractionSupabase(),
    userId = null,
  }: ResourceExtractionOptions = {},
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

  const { jobId, resource, text, textSource } = await prepareResourceExtraction({
    extractionType: "answer_key",
    resourceId,
    supabase,
    userId,
  });

  try {
    const prepared = prepareTextForExtraction({
      chunkSize,
      text,
      threshold: chunkThreshold,
    });
    const chunkWarnings: string[] = [];
    const chunkResults: AnswerKeyExtractionResult[] = [];
    const rawOutputs: unknown[] = [];
    let quotaRetryAfterSeconds: number | undefined;
    let model = process.env.GEMINI_MODEL ?? null;

    await updateExtractionJobDiagnostics({
      diagnostics: prepared.diagnostics,
      jobId,
      supabase,
      textSource,
    });
    console.info("[ai extract] answer key text prepared", {
      chunk_count: prepared.diagnostics.chunkCount,
      extraction_strategy: prepared.diagnostics.strategy,
      resource_id: resourceId,
      text_char_count: prepared.diagnostics.textCharCount,
      text_token_estimate: prepared.diagnostics.tokenEstimate,
    });

    if (prepared.diagnostics.strategy === "single_call") {
      const { generated, result } = await generateAndValidateExtraction({
        jobId,
        prompt: buildAnswerKeyExtractionPrompt(toPromptMetadata(resource), prepared.text),
        responseJsonSchema: answerKeyExtractionJsonSchema,
        schema: AnswerKeyExtractionResultSchema,
        supabase,
      });

      chunkResults.push(result);
      rawOutputs.push(generated.rawJson);
      model = generated.model;
    } else {
      for (const chunk of prepared.chunks) {
        try {
          const { generated, result } = await extractAnswerKeyChunk({
            chunk,
            chunkCount: prepared.chunks.length,
            jobId,
            resource,
            supabase,
          });

          chunkResults.push(result);
          rawOutputs.push(generated.rawJson);
          model = generated.model;
        } catch (error) {
          if (isQuotaExceededError(error)) {
            quotaRetryAfterSeconds = getRetryAfterSeconds(error);
            chunkWarnings.push(
              "Partial extraction completed. Gemini quota was reached before all chunks finished.",
            );
            break;
          }

          chunkWarnings.push(`Chunk ${chunk.index} failed: ${getErrorMessage(error)}`);
        }
      }
    }

    const result = buildMergedResult({ chunkWarnings, results: chunkResults });

    if (result.answers.length === 0) {
      if (quotaRetryAfterSeconds !== undefined || chunkWarnings.some((warning) => warning.includes("Gemini quota"))) {
        throw new ResourceExtractionError(
          "gemini_quota_exceeded",
          "Gemini quota limit reached.",
          jobId,
          quotaRetryAfterSeconds,
        );
      }

      throw new ResourceExtractionError(
        getFailureCode(chunkWarnings.length > 0 ? new Error(chunkWarnings.join("; ")) : null),
        chunkWarnings.length > 0
          ? `No answer key rows were extracted. ${chunkWarnings.join("; ")}`
          : "No answer key rows were extracted.",
        jobId,
      );
    }

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

    if (prepared.diagnostics.developmentLimitApplied) {
      chunkWarnings.push("Extraction was limited by development settings.");
    }

    if (quotaRetryAfterSeconds !== undefined || chunkWarnings.some((warning) => warning.includes("Gemini quota"))) {
      await mergeExtractionJobInputMetadata({
        jobId,
        metadata: {
          error_code: "gemini_quota_exceeded",
          quota_retry_after_seconds: quotaRetryAfterSeconds ?? null,
        },
        supabase,
      });
    }

    const status =
      prepared.diagnostics.strategy === "chunked" || chunkWarnings.length > 0
        ? "needs_review"
        : getJobStatus(result.overallConfidence);
    await updateExtractionJobSuccess({
      confidenceScore: result.overallConfidence,
      jobId,
      model: model ?? process.env.GEMINI_MODEL ?? "unknown",
      rawOutputJson: toJson({
        chunks: rawOutputs,
        diagnostics: prepared.diagnostics,
        quotaRetryAfterSeconds: quotaRetryAfterSeconds ?? null,
        warnings: chunkWarnings,
      }),
      status,
      supabase,
      validatedOutputJson: toJson(result),
    });

    return {
      extractionType: "answer_key",
      jobId,
      diagnostics: prepared.diagnostics,
      message:
        quotaRetryAfterSeconds !== undefined
          ? "Partial extraction completed. Gemini quota was reached before all chunks finished."
          : prepared.diagnostics.strategy === "chunked" && chunkWarnings.length > 0
          ? "Extraction partially completed. Review the extracted records and warnings."
          : undefined,
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
