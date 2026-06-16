import "server-only";

import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
export const DEFAULT_GEMINI_TIMEOUT_MS = 90000;

export type GeminiErrorCode =
  | "missing_key"
  | "api_error"
  | "timeout"
  | "invalid_response"
  | "quota_exceeded";

export class GeminiInfrastructureError extends Error {
  code: GeminiErrorCode;
  rawText?: string;
  retryAfterSeconds?: number;

  constructor(
    code: GeminiErrorCode,
    message: string,
    rawText?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GeminiInfrastructureError";
    this.code = code;
    this.rawText = rawText;
    this.retryAfterSeconds = retryAfterSeconds;
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

export function getGeminiTimeoutMs(defaultValue = DEFAULT_GEMINI_TIMEOUT_MS) {
  const configuredTimeout = Number(process.env.GEMINI_TIMEOUT_MS);

  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : defaultValue;
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

function extractRetryAfterSeconds(message: string) {
  const retryDelayMatch = message.match(/retryDelay["']?\s*:\s*["']?(\d+)s/i);
  const retryInMatch = message.match(/retry\s+in\s+(?:about\s+)?(\d+)\s*seconds?/i);
  const retryAfterMatch = message.match(/retry(?:\s+after)?\s+(\d+)\s*s/i);
  const value = retryDelayMatch?.[1] ?? retryInMatch?.[1] ?? retryAfterMatch?.[1];

  return value ? Number(value) : undefined;
}

function normalizeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit|retryDelay/i.test(message)) {
    return new GeminiInfrastructureError(
      "quota_exceeded",
      "Gemini quota limit reached.",
      undefined,
      extractRetryAfterSeconds(message),
    );
  }

  return new GeminiInfrastructureError("api_error", message || "Gemini request failed.");
}

export async function generateStructuredGeminiJson({
  model = DEFAULT_GEMINI_MODEL,
  prompt,
  responseJsonSchema,
  timeoutMs = getGeminiTimeoutMs(),
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

    throw normalizeGeminiError(error);
  }
}
