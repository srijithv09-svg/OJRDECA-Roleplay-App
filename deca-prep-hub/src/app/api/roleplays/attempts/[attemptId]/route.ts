import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { RoleplayAttemptInput } from "@/lib/types";

type RouteContext = {
  params: Promise<{ attemptId: string }>;
};

const attemptColumns =
  "id,user_id,resource_id,response_notes,performance_indicator_notes,self_reflection,judge_feedback,audio_path,transcript,transcript_status,ai_feedback_status,ai_overall_score,ai_feedback_json,strengths,growth_areas,confidence_rating,created_at,updated_at";
const roleplayResourceColumns =
  "id,title,cluster,event_code,event_name,event_category,year,resource_type,original_filename,performance_indicators,performance_indicators_reviewed";

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

export async function GET(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: attempt, error: attemptError } = await supabase
      .from("roleplay_attempts")
      .select(attemptColumns)
      .eq("id", attemptId)
      .maybeSingle();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "This saved roleplay attempt could not be found." },
        { status: 404 },
      );
    }

    if (attempt.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only view your own roleplay attempts." },
        { status: 403 },
      );
    }

    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select(roleplayResourceColumns)
      .eq("id", attempt.resource_id)
      .single();

    if (resourceError) {
      return NextResponse.json({ error: resourceError.message }, { status: 404 });
    }

    return NextResponse.json({ attempt, resource });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load roleplay attempt.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
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
    const { attemptId } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: existingAttempt, error: existingError } = await supabase
      .from("roleplay_attempts")
      .select("id,user_id")
      .eq("id", attemptId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existingAttempt) {
      return NextResponse.json(
        { error: "This saved roleplay attempt could not be found." },
        { status: 404 },
      );
    }

    if (existingAttempt.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only update your own roleplay attempts." },
        { status: 403 },
      );
    }

    const { data: attempt, error: updateError } = await supabase
      .from("roleplay_attempts")
      .update(input)
      .eq("id", attemptId)
      .select(attemptColumns)
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ attempt });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to update this roleplay attempt.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { attemptId } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: attempt, error: attemptError } = await supabase
      .from("roleplay_attempts")
      .select("id,user_id,audio_path")
      .eq("id", attemptId)
      .maybeSingle();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "This saved roleplay attempt could not be found." },
        { status: 404 },
      );
    }

    if (attempt.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own roleplay attempts." },
        { status: 403 },
      );
    }

    if (attempt.audio_path) {
      const { error: audioDeleteError } = await supabase.storage
        .from("roleplay-audio")
        .remove([attempt.audio_path]);

      if (audioDeleteError) {
        return NextResponse.json({ error: audioDeleteError.message }, { status: 500 });
      }
    }

    const { error: deleteError } = await supabase
      .from("roleplay_attempts")
      .delete()
      .eq("id", attemptId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to delete this roleplay attempt.",
      },
      { status: 500 },
    );
  }
}
