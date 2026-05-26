import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { buildStudentAnalytics } from "@/lib/server/exam-analytics";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: attempts, error: attemptsError } = await supabase
      .from("exam_attempts")
      .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false });

    if (attemptsError) {
      return NextResponse.json({ error: attemptsError.message }, { status: 500 });
    }

    const attemptRows = attempts ?? [];

    if (attemptRows.length === 0) {
      return NextResponse.json(
        buildStudentAnalytics({
          attempts: [],
          answers: [],
          resources: [],
        }),
      );
    }

    const attemptIds = attemptRows.map((attempt) => attempt.id);
    const resourceIds = Array.from(new Set(attemptRows.map((attempt) => attempt.resource_id)));
    const [{ data: answers, error: answersError }, { data: resources, error: resourcesError }] =
      await Promise.all([
        supabase
          .from("exam_attempt_answers")
          .select(
            "id,attempt_id,question_number,selected_answer,correct_answer,is_correct,instructional_area",
          )
          .in("attempt_id", attemptIds),
        supabase.from("resources").select("*").in("id", resourceIds),
      ]);

    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    if (resourcesError) {
      return NextResponse.json({ error: resourcesError.message }, { status: 500 });
    }

    return NextResponse.json(
      buildStudentAnalytics({
        attempts: attemptRows,
        answers: answers ?? [],
        resources: resources ?? [],
      }),
    );
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load student analytics.",
      },
      { status: 500 },
    );
  }
}
