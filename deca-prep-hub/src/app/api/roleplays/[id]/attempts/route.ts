import { NextResponse } from "next/server";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { RoleplayAttemptInput, RoleplayAttemptSummary } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseConfidenceRating(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Confidence rating must be between 1 and 5.");
  }

  return rating;
}

function parseAttemptInput(payload: unknown): RoleplayAttemptInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must include attempt notes.");
  }

  const input = payload as Record<string, unknown>;

  return {
    response_notes: normalizeText(input.response_notes),
    performance_indicator_notes: normalizeText(input.performance_indicator_notes),
    self_reflection: normalizeText(input.self_reflection),
    judge_feedback: normalizeText(input.judge_feedback),
    confidence_rating: parseConfidenceRating(input.confidence_rating),
  };
}

function toSummary(row: {
  id: string;
  resource_id: string;
  confidence_rating: number | null;
  transcript_status: RoleplayAttemptSummary["transcript_status"];
  ai_feedback_status: RoleplayAttemptSummary["ai_feedback_status"];
  created_at: string | null;
}, resource: {
  title: string | null;
  event_code: string | null;
  event_name: string | null;
  event_category: string | null;
  cluster: string | null;
} | null): RoleplayAttemptSummary {
  return {
    id: row.id,
    resource_id: row.resource_id,
    resource_title: resource?.title ?? "Roleplay practice",
    event_code: resource?.event_code ?? null,
    event_name: resource?.event_name ?? null,
    event_category: resource?.event_category ?? null,
    cluster: resource?.cluster ?? null,
    confidence_rating: row.confidence_rating,
    transcript_status: row.transcript_status,
    ai_feedback_status: row.ai_feedback_status,
    created_at: row.created_at,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const [{ data, error }, { data: resource, error: resourceError }] = await Promise.all([
      supabase
      .from("roleplay_attempts")
      .select(
        "id,resource_id,confidence_rating,transcript_status,ai_feedback_status,created_at",
      )
      .eq("user_id", user.id)
      .eq("resource_id", id)
      .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("resources")
        .select("title,event_code,event_name,event_category,cluster")
        .eq("id", id)
        .maybeSingle(),
    ]);

    if (error) {
      logDeveloperError("[roleplay attempts api] recent attempts failed", error);
      return NextResponse.json([]);
    }

    if (resourceError) {
      logDeveloperError("[roleplay attempts api] resource summary failed", resourceError);
    }

    return NextResponse.json((data ?? []).map((row) => toSummary(row, resource)));
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load roleplay attempts.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let input: RoleplayAttemptInput;

  try {
    input = parseAttemptInput(await request.json());
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to parse roleplay attempt.",
      },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select("id,resource_type,approval_status")
      .eq("id", id)
      .maybeSingle();

    if (resourceError) {
      logDeveloperError("[roleplay attempts api] practice resource lookup failed", resourceError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(resourceError, "Unable to verify this roleplay.") },
        { status: 500 },
      );
    }

    if (!resource) {
      return NextResponse.json({ error: "This roleplay could not be found." }, { status: 404 });
    }

    if (resource.resource_type !== "roleplay" || resource.approval_status !== "approved") {
      return NextResponse.json(
        { error: "This roleplay is not available for practice." },
        { status: 403 },
      );
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("roleplay_attempts")
      .insert({
        user_id: user.id,
        resource_id: id,
        ...input,
      })
      .select("id")
      .single();

    if (attemptError) {
      logDeveloperError("[roleplay attempts api] create attempt failed", attemptError);
      return NextResponse.json(
        { error: getFriendlyErrorMessage(attemptError, "Unable to save this roleplay attempt.") },
        { status: 500 },
      );
    }

    return NextResponse.json({ attemptId: attempt.id });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to save this roleplay attempt.",
      },
      { status: 500 },
    );
  }
}
