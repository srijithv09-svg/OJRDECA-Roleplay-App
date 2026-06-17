import "server-only";

import { z } from "zod";
import {
  generateStructuredGeminiJson,
  GeminiInfrastructureError,
} from "@/lib/ai/gemini/client";
import {
  buildCurriculumDraftPrompt,
  type CurriculumDraftPromptInput,
} from "@/lib/ai/gemini/prompts";
import {
  curriculumDraftJsonSchema,
  CurriculumDraftResultSchema,
  type CurriculumDraftResult,
} from "@/lib/ai/gemini/schemas";

export const MAX_CURRICULUM_DRAFT_PIS = 25;
export const MAX_QUESTIONS_PER_CONCEPT = 5;
export const MAX_DRAFT_MODULES = 3;

export type CurriculumDraftErrorCode =
  | "gemini_missing_key"
  | "gemini_quota_exceeded"
  | "gemini_timeout"
  | "gemini_invalid_output"
  | "gemini_api_error"
  | "input_too_large";

export class CurriculumDraftError extends Error {
  code: CurriculumDraftErrorCode;
  retryAfterSeconds?: number;

  constructor(code: CurriculumDraftErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "CurriculumDraftError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function normalizePiText(value: string) {
  return value
    .replace(/^[\s*•\-–—\d.)]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPerformanceIndicatorsFromText(input: string) {
  return Array.from(
    new Set(
      input
        .split(/\r?\n|;/)
        .map(normalizePiText)
        .filter((line) => line.length >= 8),
    ),
  );
}

function normalizeError(error: unknown): CurriculumDraftError {
  if (error instanceof CurriculumDraftError) {
    return error;
  }

  if (error instanceof GeminiInfrastructureError) {
    if (error.code === "missing_key") {
      return new CurriculumDraftError(
        "gemini_missing_key",
        "Gemini is not configured. Add GEMINI_API_KEY in the server environment to enable curriculum drafting.",
      );
    }

    if (error.code === "quota_exceeded") {
      return new CurriculumDraftError(
        "gemini_quota_exceeded",
        error.retryAfterSeconds
          ? `Gemini quota limit reached. Try again in about ${error.retryAfterSeconds} seconds.`
          : "Gemini quota limit reached. Try again later.",
        error.retryAfterSeconds,
      );
    }

    if (error.code === "timeout") {
      return new CurriculumDraftError(
        "gemini_timeout",
        "Curriculum drafting took too long. Try fewer performance indicators.",
      );
    }

    if (error.code === "invalid_response") {
      return new CurriculumDraftError(
        "gemini_invalid_output",
        "Gemini returned curriculum draft data that could not be validated.",
      );
    }
  }

  if (error instanceof z.ZodError) {
    return new CurriculumDraftError(
      "gemini_invalid_output",
      "Gemini returned curriculum draft data that did not match the expected structure.",
    );
  }

  return new CurriculumDraftError(
    "gemini_api_error",
    "Curriculum drafting could not be completed right now.",
  );
}

export async function generateCurriculumDraft(input: CurriculumDraftPromptInput): Promise<{
  draft: CurriculumDraftResult;
  model: string;
  rawText: string;
}> {
  if (input.performanceIndicators.length > MAX_CURRICULUM_DRAFT_PIS) {
    throw new CurriculumDraftError(
      "input_too_large",
      `Choose ${MAX_CURRICULUM_DRAFT_PIS} or fewer performance indicators per draft run.`,
    );
  }

  try {
    const generated = await generateStructuredGeminiJson({
      prompt: buildCurriculumDraftPrompt(input),
      responseJsonSchema: curriculumDraftJsonSchema,
    });

    return {
      draft: CurriculumDraftResultSchema.parse(generated.rawJson),
      model: generated.model,
      rawText: generated.rawText,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}
