import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { saveQuestionAttempt } from "@/lib/server/learning-attempts";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Unauthorized." }, { status: 401 });
  }

  let body: { answer?: unknown; question_id?: unknown };

  try {
    body = (await request.json()) as { answer?: unknown; question_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.question_id !== "string" || !body.question_id.trim()) {
    return NextResponse.json({ error: "question_id is required." }, { status: 400 });
  }

  try {
    const result = await saveQuestionAttempt({
      answer: body.answer ?? null,
      questionId: body.question_id,
      supabase: getSupabaseAdminClient(),
      userId: user.id,
    });

    return NextResponse.json({
      attempt: result.attempt,
      isCorrect: result.isCorrect,
      mastery: result.mastery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save this learning attempt.",
      },
      { status: 400 },
    );
  }
}
