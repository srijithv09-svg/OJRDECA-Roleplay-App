import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { buildStudentAnalytics } from "@/lib/server/exam-analytics";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  ExamAttempt,
  ExamAttemptAnswer,
  ResourceListItem,
  RoleplayAttempt,
} from "@/lib/types";

export async function GET(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [examAttemptsResult, roleplayAttemptsResult] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false }),
      supabase
        .from("roleplay_attempts")
        .select(
          "id,user_id,resource_id,response_notes,performance_indicator_notes,self_reflection,judge_feedback,audio_path,transcript,transcript_status,ai_feedback_status,ai_overall_score,ai_feedback_json,strengths,growth_areas,confidence_rating,created_at,updated_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    let examAnalyticsUnavailable = Boolean(examAttemptsResult.error);
    const roleplayPracticeUnavailable = Boolean(roleplayAttemptsResult.error);
    const attemptRows = (examAttemptsResult.error ? [] : (examAttemptsResult.data ?? [])) as ExamAttempt[];
    const roleplayAttemptRows = (
      roleplayAttemptsResult.error ? [] : (roleplayAttemptsResult.data ?? [])
    ) as RoleplayAttempt[];

    const attemptIds = attemptRows.map((attempt) => attempt.id);
    const resourceIds = Array.from(
      new Set([
        ...attemptRows.map((attempt) => attempt.resource_id),
        ...roleplayAttemptRows.map((attempt) => attempt.resource_id),
      ]),
    );
    const [{ data: answers, error: answersError }, { data: resources, error: resourcesError }] =
      await Promise.all([
        attemptIds.length > 0 && !examAnalyticsUnavailable
          ? supabase
              .from("exam_attempt_answers")
              .select(
                "id,attempt_id,question_number,selected_answer,correct_answer,is_correct,instructional_area",
              )
              .in("attempt_id", attemptIds)
          : Promise.resolve({ data: [], error: null }),
        resourceIds.length > 0
          ? supabase.from("resources").select("*").in("id", resourceIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (answersError) {
      examAnalyticsUnavailable = true;
    }

    return NextResponse.json(
      buildStudentAnalytics({
        attempts: examAnalyticsUnavailable ? [] : attemptRows,
        answers: examAnalyticsUnavailable ? [] : ((answers ?? []) as ExamAttemptAnswer[]),
        examAnalyticsUnavailable,
        roleplayAttempts: roleplayAttemptRows,
        roleplayPracticeUnavailable,
        resources: resourcesError ? [] : ((resources ?? []) as ResourceListItem[]),
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
