import { NextResponse } from "next/server";
import { requireAdminRequester } from "@/lib/server/api-auth";
import { buildAdminAnalytics } from "@/lib/server/exam-analytics";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { error: authError, user } = await requireAdminRequester(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: user ? 403 : 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [
      { data: attempts, error: attemptsError },
      { data: resources, error: resourcesError },
      { data: answers, error: answersError },
      profileCountResult,
      profilesResult,
    ] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
        .order("completed_at", { ascending: false }),
      supabase.from("resources").select("*"),
      supabase
        .from("exam_attempt_answers")
        .select(
          "id,attempt_id,question_number,selected_answer,correct_answer,is_correct,instructional_area",
        ),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id,email"),
    ]);

    if (attemptsError) {
      return NextResponse.json({ error: attemptsError.message }, { status: 500 });
    }

    if (resourcesError) {
      return NextResponse.json({ error: resourcesError.message }, { status: 500 });
    }

    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    const profileEmailsById = new Map<string, string | null>();

    if (!profilesResult.error) {
      for (const userProfile of profilesResult.data ?? []) {
        profileEmailsById.set(userProfile.id, userProfile.email);
      }
    }

    return NextResponse.json(
      buildAdminAnalytics({
        attempts: attempts ?? [],
        answers: answers ?? [],
        resources: resources ?? [],
        profileCount: profileCountResult.error ? null : (profileCountResult.count ?? 0),
        profileEmailsById,
      }),
    );
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load admin analytics.",
      },
      { status: 500 },
    );
  }
}
