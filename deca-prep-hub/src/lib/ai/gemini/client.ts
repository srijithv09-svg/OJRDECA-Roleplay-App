import "server-only";

import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export type GeminiErrorCode = "missing_key" | "api_error" | "timeout" | "invalid_response";

export class GeminiInfrastructureError extends Error {
  code: GeminiErrorCode;
  rawText?: string;

  constructor(code: GeminiErrorCode, message: string, rawText?: string) {
    super(message);
    this.name = "GeminiInfrastructureError";
    this.code = code;
    this.rawText = rawText;
  }
}

type GenerateStructuredGeminiJsonOptions = {
  prompt: string;
  model?: string;
  responseJsonSchema?: unknown;
  timeoutMs?: number;
};

export type StructuredGeminiJsonResult = {
  model: string;
  rawText: string;
  rawJson: unknown;
};

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new GeminiInfrastructureError(
      "missing_key",
      "GEMINI_API_KEY is not configured. Add it as a server-only environment variable.",
    );
  }

  return apiKey;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new GeminiInfrastructureError(
          "timeout",
          `Gemini request timed out after ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getResponseText(response: unknown) {
  const textOrFn = (response as { text?: string | (() => string) }).text;

  if (typeof textOrFn === "function") {
    return textOrFn();
  }

  return textOrFn ?? "";
}

function parseJsonObject(rawText: string) {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new GeminiInfrastructureError(
      "invalid_response",
      "Gemini returned a response that was not valid JSON.",
      rawText,
    );
  }
}

export async function generateStructuredGeminiJson({
  model = DEFAULT_GEMINI_MODEL,
  prompt,
  responseJsonSchema,
  timeoutMs = 30000,
}: GenerateStructuredGeminiJsonOptions): Promise<StructuredGeminiJsonResult> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      }),
      timeoutMs,
    );
    const rawText = getResponseText(response).trim();

    if (!rawText) {
      throw new GeminiInfrastructureError(
        "invalid_response",
        "Gemini returned an empty response.",
      );
    }

    return {
      model,
      rawText,
      rawJson: parseJsonObject(rawText),
    };
  } catch (error) {
    if (error instanceof GeminiInfrastructureError) {
      throw error;
    }

    throw new GeminiInfrastructureError(
      "api_error",
      error instanceof Error ? error.message : "Gemini request failed.",
    );
  }
}
