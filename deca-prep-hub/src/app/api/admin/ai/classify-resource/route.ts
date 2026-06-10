import { NextResponse } from "next/server";
import {
  classifyResourceById,
  ResourceClassificationError,
} from "@/lib/ai/extraction/resource-classifier";
import { requireAdminRequester } from "@/lib/server/api-auth";

type ClassifyResourceRequest = {
  resource_id?: unknown;
};

function getAuthStatus(error: string) {
  return error.toLowerCase().includes("admin access") ? 403 : 401;
}

function getErrorStatus(error: ResourceClassificationError) {
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

  return 500;
}

export async function POST(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json(
      { error: authError ?? "Unauthorized." },
      { status: getAuthStatus(authError ?? "Unauthorized.") },
    );
  }

  let body: ClassifyResourceRequest;

  try {
    body = (await request.json()) as ClassifyResourceRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.resource_id !== "string" || body.resource_id.trim().length === 0) {
    return NextResponse.json({ error: "resource_id is required." }, { status: 400 });
  }

  try {
    const result = await classifyResourceById(body.resource_id, { userId: user.id });

    return NextResponse.json({
      job_id: result.jobId,
      status: result.status,
      classification_id: result.classificationId,
      classification: result.result,
    });
  } catch (error) {
    if (error instanceof ResourceClassificationError) {
      return NextResponse.json(
        {
          error: error.message,
          job_id: error.jobId ?? null,
          code: error.code,
        },
        { status: getErrorStatus(error) },
      );
    }

    return NextResponse.json({ error: "Resource classification failed." }, { status: 500 });
  }
}
