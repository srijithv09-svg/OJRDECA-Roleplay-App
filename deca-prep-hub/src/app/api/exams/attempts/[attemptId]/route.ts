import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ExamAttemptAnswer, InstructionalAreaBreakdown } from "@/lib/types";

type RouteContext = {
  params: Promise<{ attemptId: string }>;
};

function buildBreakdown(answers: ExamAttemptAnswer[]): InstructionalAreaBreakdown[] {
  const breakdown = new Map<string, { correct_count: number; total_count: number }>();

  for (const answer of answers) {
    if (!answer.instructional_area) {
      continue;
    }

    const current = breakdown.get(answer.instructional_area) ?? {
      correct_count: 0,
      total_count: 0,
    };

    current.total_count += 1;

    if (answer.is_correct) {
      current.correct_count += 1;
    }

    breakdown.set(answer.instructional_area, current);
  }

  return Array.from(breakdown.entries())
    .map(([instructionalArea, counts]) => ({
      instructional_area: instructionalArea,
      correct_count: counts.correct_count,
      total_count: counts.total_count,
      percentage:
        counts.total_count > 0
          ? Number(((counts.correct_count / counts.total_count) * 100).toFixed(2))
          : 0,
    }))
    .sort((first, second) => first.instructional_area.localeCompare(second.instructional_area));
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
      .from("exam_attempts")
      .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
      .eq("id", attemptId)
      .maybeSingle();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "This saved attempt could not be found." },
        { status: 404 },
      );
    }

    if (attempt.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only view your own exam attempts." },
        { status: 403 },
      );
    }

    const [{ data: resource, error: resourceError }, { data: answers, error: answersError }] =
      await Promise.all([
        supabase
          .from("resources")
          .select("id,title,cluster,event_code,event_name,event_category,year,resource_type,original_filename")
          .eq("id", attempt.resource_id)
          .single(),
        supabase
          .from("exam_attempt_answers")
          .select(
            "id,attempt_id,question_number,selected_answer,correct_answer,is_correct,instructional_area",
          )
          .eq("attempt_id", attemptId)
          .order("question_number", { ascending: true }),
      ]);

    if (resourceError) {
      return NextResponse.json({ error: resourceError.message }, { status: 404 });
    }

    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    const answerRows = answers ?? [];

    return NextResponse.json({
      attempt,
      resource,
      answers: answerRows,
      breakdown: buildBreakdown(answerRows),
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load exam attempt results.",
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
      .from("exam_attempts")
      .select("id,user_id")
      .eq("id", attemptId)
      .maybeSingle();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "This saved attempt could not be found." },
        { status: 404 },
      );
    }

    if (attempt.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own exam attempts." },
        { status: 403 },
      );
    }

    const { error: deleteError } = await supabase
      .from("exam_attempts")
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
            : "Unable to delete this exam attempt.",
      },
      { status: 500 },
    );
  }
}
