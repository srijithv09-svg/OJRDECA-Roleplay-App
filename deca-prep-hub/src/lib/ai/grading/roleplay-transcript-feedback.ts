import "server-only";

import {
  generateStructuredGeminiJson,
  GeminiInfrastructureError,
} from "@/lib/ai/gemini/client";
import {
  buildRoleplayTranscriptFeedbackPrompt,
  type RoleplayTranscriptFeedbackPromptInput,
} from "@/lib/ai/gemini/prompts";
import {
  roleplayTranscriptFeedbackJsonSchema,
  RoleplayTranscriptFeedbackResultSchema,
  type RoleplayTranscriptFeedbackResult,
} from "@/lib/ai/gemini/schemas";
import { z } from "zod";

export type RoleplayFeedbackErrorCode =
  | "gemini_missing_key"
  | "gemini_quota_exceeded"
  | "gemini_timeout"
  | "gemini_invalid_output"
  | "gemini_api_error";

export class RoleplayFeedbackError extends Error {
  code: RoleplayFeedbackErrorCode;
  retryAfterSeconds?: number;

  constructor(code: RoleplayFeedbackErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "RoleplayFeedbackError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function normalizeError(error: unknown): RoleplayFeedbackError {
  if (error instanceof RoleplayFeedbackError) {
    return error;
  }

  if (error instanceof GeminiInfrastructureError) {
    if (error.code === "missing_key") {
      return new RoleplayFeedbackError(
        "gemini_missing_key",
        "AI feedback is not configured yet. Your roleplay attempt was saved, but feedback could not be generated.",
      );
    }

    if (error.code === "quota_exceeded") {
      return new RoleplayFeedbackError(
        "gemini_quota_exceeded",
        "Gemini quota limit reached. Try again later. Your roleplay attempt was saved.",
        error.retryAfterSeconds,
      );
    }

    if (error.code === "timeout") {
      return new RoleplayFeedbackError(
        "gemini_timeout",
        "AI feedback took too long. Try again later. Your roleplay attempt was saved.",
      );
    }

    if (error.code === "invalid_response") {
      return new RoleplayFeedbackError(
        "gemini_invalid_output",
        "AI feedback could not be generated cleanly. Try again later.",
      );
    }
  }

  if (error instanceof z.ZodError) {
    return new RoleplayFeedbackError(
      "gemini_invalid_output",
      "AI feedback could not be generated cleanly. Try again later.",
    );
  }

  return new RoleplayFeedbackError(
    "gemini_api_error",
    "AI feedback could not be generated right now. Your roleplay attempt was saved.",
  );
}

async function withGenericApiRetry<T>(operation: () => Promise<T>) {
  let lastError: RoleplayFeedbackError | null = null;

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

  throw lastError ?? new RoleplayFeedbackError(
    "gemini_api_error",
    "AI feedback could not be generated right now. Your roleplay attempt was saved.",
  );
}

export async function generateRoleplayTranscriptFeedback(
  input: RoleplayTranscriptFeedbackPromptInput,
): Promise<{
  feedback: RoleplayTranscriptFeedbackResult;
  model: string;
  rawText: string;
}> {
  return withGenericApiRetry(async () => {
    const generated = await generateStructuredGeminiJson({
      prompt: buildRoleplayTranscriptFeedbackPrompt(input),
      responseJsonSchema: roleplayTranscriptFeedbackJsonSchema,
    });

    return {
      feedback: RoleplayTranscriptFeedbackResultSchema.parse(generated.rawJson),
      model: generated.model,
      rawText: generated.rawText,
    };
  });
}
