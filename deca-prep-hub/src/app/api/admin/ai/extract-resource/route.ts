import { NextResponse } from "next/server";
import {
  extractResource,
  type ExtractResourceOptions,
} from "@/lib/ai/extraction/resource-extraction-orchestrator";
import {
  ResourceExtractionError,
  type ResourceExtractionType,
} from "@/lib/ai/extraction/shared";
import { requireAdminRequester } from "@/lib/server/api-auth";

export const runtime = "nodejs";

type ExtractResourceRequest = {
  extraction_type?: unknown;
  force?: unknown;
  resource_id?: unknown;
};
type ErrorDetails = string | undefined;

function getAuthStatus(error: string) {
  return error.toLowerCase().includes("admin access") ? 403 : 401;
}

function getErrorStatus(error: ResourceExtractionError) {
  if (error.code === "resource_not_found") {
    return 404;
  }

  if (error.code === "gemini_missing_key") {
    return 503;
  }

  if (error.code === "gemini_quota_exceeded") {
    return 429;
  }

  if (error.code === "pdf_text_extraction_failed" || error.code === "storage_text_unavailable") {
    return 422;
  }

  if (
    ["gemini_api_error", "gemini_timeout", "gemini_invalid_response", "schema_validation_failed"].includes(
      error.code,
    )
  ) {
    return 502;
  }

  if (error.code === "unsupported_extraction_type") {
    return 400;
  }

  return 500;
}

function parseExtractionType(value: unknown): ResourceExtractionType | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (
    value === "answer_key" ||
    value === "exam" ||
    value === "judge_rubric" ||
    value === "roleplay"
  ) {
    return value;
  }

  throw new ResourceExtractionError(
    "unsupported_extraction_type",
    "extraction_type must be one of exam, answer_key, roleplay, or judge_rubric.",
  );
}

function jsonFailure({
  code,
  details,
  message,
  retryAfterSeconds,
  status,
}: {
  code: string;
  details?: ErrorDetails;
  message: string;
  retryAfterSeconds?: number;
  status: number;
}) {
  return NextResponse.json(
    {
      error: {
        code,
        details,
        message,
        retryAfterSeconds,
      },
      ok: false,
    },
    { status },
  );
}

function logExtractionFailure({
  code,
  extractionType,
  resourceId,
  status,
  userId,
}: {
  code: string;
  extractionType?: unknown;
  resourceId?: string | null;
  status: number;
  userId?: string | null;
}) {
  console.warn("[ai extract] failed", {
    code,
    extraction_type: extractionType ?? null,
    resource_id: resourceId ?? null,
    status,
    user_id: userId ?? null,
  });
}

export async function POST(request: Request) {
  let extractionType: unknown = null;
  let resourceId: string | null = null;
  let userId: string | null = null;

  try {
    console.info("[ai extract] route reached");
    const { error: authError, user } = await requireAdminRequester(request);

    if (authError || !user) {
      const status = getAuthStatus(authError ?? "Unauthorized.");
      const code = status === 403 ? "forbidden" : "unauthorized";

      logExtractionFailure({ code, resourceId, status, userId });

      return jsonFailure({
        code,
        message: authError ?? "Unauthorized.",
        status,
      });
    }

    userId = user.id;

    let body: ExtractResourceRequest;

    try {
      body = (await request.json()) as ExtractResourceRequest;
    } catch {
      const status = 400;
      const code = "invalid_json";

      logExtractionFailure({ code, resourceId, status, userId });

      return jsonFailure({
        code,
        message: "Request body must be valid JSON.",
        status,
      });
    }

    extractionType = body.extraction_type ?? null;

    if (typeof body.resource_id !== "string" || body.resource_id.trim().length === 0) {
      const status = 400;
      const code = "missing_resource_id";

      logExtractionFailure({ code, extractionType, resourceId, status, userId });

      return jsonFailure({
        code,
        message: "resource_id is required.",
        status,
      });
    }

    resourceId = body.resource_id;
    console.info("[ai extract] request", {
      extraction_type: extractionType,
      resource_id: resourceId,
      user_id: userId,
    });

    try {
      const options: ExtractResourceOptions & { resourceId: string } = {
        extractionType: parseExtractionType(body.extraction_type),
        force: body.force === true,
        resourceId,
        userId,
      };
      const summary = await extractResource(options);

      console.info("[ai extract] succeeded", {
        extraction_type: summary.extractionType,
        job_id: summary.jobId,
        resource_id: resourceId,
        status: summary.status,
        user_id: userId,
      });

      return NextResponse.json({
        jobId: summary.jobId,
        ok: true,
        status: summary.status,
        summary,
      });
    } catch (error) {
      if (error instanceof ResourceExtractionError) {
        const status = getErrorStatus(error);

        logExtractionFailure({
          code: error.code,
          extractionType,
          resourceId,
          status,
          userId,
        });

        return jsonFailure({
          code: error.code,
          details: error.jobId ? `job_id: ${error.jobId}` : undefined,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          status,
        });
      }

      const status = 500;
      const code = "resource_extraction_failed";

      logExtractionFailure({ code, extractionType, resourceId, status, userId });
      console.error("[ai extract] unexpected extraction failure", {
        message: error instanceof Error ? error.message : "Unknown error",
        resource_id: resourceId,
        user_id: userId,
      });

      return jsonFailure({
        code,
        message: "Resource extraction failed.",
        status,
      });
    }
  } catch (error) {
    const status = 500;
    const code = "unexpected_error";

    logExtractionFailure({ code, extractionType, resourceId, status, userId });
    console.error("[ai extract] unexpected route failure", {
      message: error instanceof Error ? error.message : "Unknown error",
      resource_id: resourceId,
      user_id: userId,
    });

    return jsonFailure({
      code,
      message: "AI extraction failed before the request could be completed.",
      status,
    });
  }
}
