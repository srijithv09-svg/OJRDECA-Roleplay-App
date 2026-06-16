import "server-only";

import {
  buildExamChunkExtractionPrompt,
  buildExamExtractionPrompt,
} from "@/lib/ai/gemini/prompts";
import {
  ExamExtractionResultSchema,
  examExtractionJsonSchema,
  type ExamExtractionResult,
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
  resolveCanonicalEventId,
  ResourceExtractionError,
  type ExtractionSummary,
  type ResourceExtractionOptions,
  toJson,
  toPromptMetadata,
  updateExtractionJobDiagnostics,
  updateExtractionJobSuccess,
} from "./shared";
import { prepareExamTextForExtraction, type TextChunk } from "./text-prep";

type ExtractedQuestion = ExamExtractionResult["questions"][number];

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

function mergeQuestions(results: ExamExtractionResult[]) {
  const questionMap = new Map<number, ExtractedQuestion>();

  for (const result of results) {
    for (const question of result.questions) {
      if (!questionMap.has(question.questionNumber)) {
        questionMap.set(question.questionNumber, question);
      }
    }
  }

  return [...questionMap.values()].sort((a, b) => a.questionNumber - b.questionNumber);
}

function mergeWarnings(results: ExamExtractionResult[], chunkWarnings: string[]) {
  return [
    ...chunkWarnings,
    ...results.flatMap((result) => result.warnings),
    ...results.flatMap((result) =>
      result.questions.flatMap((question) =>
        question.warnings.map((warning) => `Question ${question.questionNumber}: ${warning}`),
      ),
    ),
  ].filter(Boolean);
}

function averageConfidence(results: ExamExtractionResult[]) {
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
  results: ExamExtractionResult[];
}): ExamExtractionResult {
  const firstResult = results[0];

  return {
    detectedCluster: firstResult?.detectedCluster ?? null,
    detectedEventCode: firstResult?.detectedEventCode ?? null,
    detectedEventName: firstResult?.detectedEventName ?? null,
    detectedExamCluster: firstResult?.detectedExamCluster ?? null,
    detectedYear: firstResult?.detectedYear ?? null,
    overallConfidence: averageConfidence(results),
    questions: mergeQuestions(results),
    resourceType: "exam",
    title: firstResult?.title ?? null,
    warnings: mergeWarnings(results, chunkWarnings),
  };
}

async function extractExamChunk({
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
    prompt: buildExamChunkExtractionPrompt({
      chunkCount,
      chunkIndex: chunk.index,
      metadata: toPromptMetadata(resource),
      questionEnd: chunk.questionEnd,
      questionStart: chunk.questionStart,
      text: chunk.text,
    }),
    responseJsonSchema: examExtractionJsonSchema,
    schema: ExamExtractionResultSchema,
    supabase,
  });
}

export async function extractExamFromResource(
  resourceId: string,
  {
    chunkSize,
    chunkThreshold,
    force = false,
    supabase = getExtractionSupabase(),
    userId = null,
  }: ResourceExtractionOptions = {},
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

  const { jobId, resource, text, textSource } = await prepareResourceExtraction({
    extractionType: "exam",
    resourceId,
    supabase,
    userId,
  });

  try {
    const prepared = prepareExamTextForExtraction({
      chunkSize,
      text,
      threshold: chunkThreshold,
    });
    const chunkWarnings: string[] = [];
    const chunkResults: ExamExtractionResult[] = [];
    const rawOutputs: unknown[] = [];
    let quotaRetryAfterSeconds: number | undefined;
    let model = process.env.GEMINI_MODEL ?? null;

    await updateExtractionJobDiagnostics({
      diagnostics: prepared.diagnostics,
      jobId,
      supabase,
      textSource,
    });
    console.info("[ai extract] text prepared", {
      chunk_count: prepared.diagnostics.chunkCount,
      extraction_strategy: prepared.diagnostics.strategy,
      resource_id: resourceId,
      text_char_count: prepared.diagnostics.textCharCount,
      text_token_estimate: prepared.diagnostics.tokenEstimate,
    });

    if (prepared.diagnostics.strategy === "single_call") {
      const { generated, result } = await generateAndValidateExtraction({
        jobId,
        prompt: buildExamExtractionPrompt(toPromptMetadata(resource), prepared.text),
        responseJsonSchema: examExtractionJsonSchema,
        schema: ExamExtractionResultSchema,
        supabase,
      });

      chunkResults.push(result);
      rawOutputs.push(generated.rawJson);
      model = generated.model;
    } else {
      for (const chunk of prepared.chunks) {
        try {
          const { generated, result } = await extractExamChunk({
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

    if (result.questions.length === 0) {
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
          ? `No exam questions were extracted. ${chunkWarnings.join("; ")}`
          : "No exam questions were extracted.",
        jobId,
      );
    }

    const eventId = await resolveCanonicalEventId({
      detectedEventCode: result.detectedEventCode,
      detectedEventName: result.detectedEventName,
      resource,
      supabase,
    });
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
      extractionType: "exam",
      jobId,
      diagnostics: prepared.diagnostics,
      message:
        quotaRetryAfterSeconds !== undefined
          ? "Partial extraction completed. Gemini quota was reached before all chunks finished."
          : prepared.diagnostics.strategy === "chunked" && chunkWarnings.length > 0
          ? "Extraction partially completed. Review the extracted records and warnings."
          : undefined,
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
