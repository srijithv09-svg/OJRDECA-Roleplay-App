import "server-only";

import {
  generateStructuredGeminiJson,
  GeminiInfrastructureError,
} from "@/lib/ai/gemini/client";
import {
  buildConceptFeedbackPrompt,
  buildConceptRevisionFeedbackPrompt,
  type ConceptFeedbackPromptInput,
  type ConceptRevisionFeedbackPromptInput,
} from "@/lib/ai/gemini/prompts";
import {
  conceptFeedbackJsonSchema,
  conceptRevisionFeedbackJsonSchema,
  ConceptFeedbackResultSchema,
  ConceptRevisionFeedbackResultSchema,
  type ConceptFeedbackResult,
  type ConceptRevisionFeedbackResult,
} from "@/lib/ai/gemini/schemas";
import { z } from "zod";

export type ConceptFeedbackErrorCode =
  | "gemini_missing_key"
  | "gemini_quota_exceeded"
  | "gemini_timeout"
  | "gemini_invalid_output"
  | "gemini_api_error";

export class ConceptFeedbackError extends Error {
  code: ConceptFeedbackErrorCode;
  retryAfterSeconds?: number;

  constructor(code: ConceptFeedbackErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ConceptFeedbackError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function normalizeError(error: unknown): ConceptFeedbackError {
  if (error instanceof ConceptFeedbackError) {
    return error;
  }

  if (error instanceof GeminiInfrastructureError) {
    if (error.code === "missing_key") {
      return new ConceptFeedbackError(
        "gemini_missing_key",
        "AI feedback is not configured yet. Your response was saved, but feedback could not be generated.",
      );
    }

    if (error.code === "quota_exceeded") {
      return new ConceptFeedbackError(
        "gemini_quota_exceeded",
        "Gemini quota limit reached. Try again later. Your response was saved.",
        error.retryAfterSeconds,
      );
    }

    if (error.code === "timeout") {
      return new ConceptFeedbackError(
        "gemini_timeout",
        "AI feedback took too long. Try again later. Your response was saved.",
      );
    }

    if (error.code === "invalid_response") {
      return new ConceptFeedbackError(
        "gemini_invalid_output",
        "AI feedback could not be generated cleanly. Try again later.",
      );
    }
  }

  if (error instanceof z.ZodError) {
    return new ConceptFeedbackError(
      "gemini_invalid_output",
      "AI feedback could not be generated cleanly. Try again later.",
    );
  }

  return new ConceptFeedbackError(
    "gemini_api_error",
    "AI feedback could not be generated right now. Your response was saved.",
  );
}

async function withGenericApiRetry<T>(operation: () => Promise<T>) {
  let lastError: ConceptFeedbackError | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = normalizeError(error);

      if (lastError.code !== "gemini_api_error" || attempt === 1) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw lastError ?? new ConceptFeedbackError(
    "gemini_api_error",
    "AI feedback could not be generated right now. Your response was saved.",
  );
}

export async function generateConceptFeedback(input: ConceptFeedbackPromptInput): Promise<{
  feedback: ConceptFeedbackResult;
  model: string;
  rawText: string;
}> {
  return withGenericApiRetry(async () => {
    const generated = await generateStructuredGeminiJson({
      prompt: buildConceptFeedbackPrompt(input),
      responseJsonSchema: conceptFeedbackJsonSchema,
    });

    return {
      feedback: ConceptFeedbackResultSchema.parse(generated.rawJson),
      model: generated.model,
      rawText: generated.rawText,
    };
  });
}

export async function generateConceptRevisionFeedback(
  input: ConceptRevisionFeedbackPromptInput,
): Promise<{
  feedback: ConceptRevisionFeedbackResult;
  model: string;
  rawText: string;
}> {
  return withGenericApiRetry(async () => {
    const generated = await generateStructuredGeminiJson({
      prompt: buildConceptRevisionFeedbackPrompt(input),
      responseJsonSchema: conceptRevisionFeedbackJsonSchema,
    });

    return {
      feedback: ConceptRevisionFeedbackResultSchema.parse(generated.rawJson),
      model: generated.model,
      rawText: generated.rawText,
    };
  });
}
