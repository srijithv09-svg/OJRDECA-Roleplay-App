import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { error: authError } = await requireAuthenticatedSchoolUser(request);

  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select("id,title,cluster,event_code,event_name,event_category,year,resource_type,approval_status,original_filename")
      .eq("id", id)
      .single();

    if (resourceError) {
      return NextResponse.json({ error: resourceError.message }, { status: 404 });
    }

    if (resource.resource_type !== "exam" || resource.approval_status !== "approved") {
      return NextResponse.json(
        { error: "This exam is not available for student grading." },
        { status: 403 },
      );
    }

    const { data: questions, error: answerKeyError } = await supabase
      .from("exam_answer_keys")
      .select("question_number,instructional_area")
      .eq("resource_id", id)
      .order("question_number", { ascending: true });

    if (answerKeyError) {
      return NextResponse.json({ error: answerKeyError.message }, { status: 500 });
    }

    return NextResponse.json({
      resource,
      hasAnswerKey: Boolean(questions?.length),
      questionCount: questions?.length ?? 0,
      questions: questions ?? [],
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load this exam for taking.",
      },
      { status: 500 },
    );
  }
}
