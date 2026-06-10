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

type ExtractResourceRequest = {
  extraction_type?: unknown;
  force?: unknown;
  resource_id?: unknown;
};

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

export async function POST(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json(
      { error: authError ?? "Unauthorized." },
      { status: getAuthStatus(authError ?? "Unauthorized.") },
    );
  }

  let body: ExtractResourceRequest;

  try {
    body = (await request.json()) as ExtractResourceRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.resource_id !== "string" || body.resource_id.trim().length === 0) {
    return NextResponse.json({ error: "resource_id is required." }, { status: 400 });
  }

  try {
    const options: ExtractResourceOptions & { resourceId: string } = {
      extractionType: parseExtractionType(body.extraction_type),
      force: body.force === true,
      resourceId: body.resource_id,
      userId: user.id,
    };
    const summary = await extractResource(options);

    return NextResponse.json({ extraction: summary });
  } catch (error) {
    if (error instanceof ResourceExtractionError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.message,
          job_id: error.jobId ?? null,
        },
        { status: getErrorStatus(error) },
      );
    }

    return NextResponse.json({ error: "Resource extraction failed." }, { status: 500 });
  }
}
