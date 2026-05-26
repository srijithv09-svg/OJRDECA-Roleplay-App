import { NextResponse } from "next/server";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ExamCorrectAnswer, ExamSelectedAnswer } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SubmittedAnswer = {
  question_number: number;
  selected_answer: ExamCorrectAnswer;
};

const answerOptions: ExamCorrectAnswer[] = ["A", "B", "C", "D", "E"];

function parseSubmittedAnswers(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("answers" in payload)) {
    throw new Error("Request body must include an answers array.");
  }

  const answers = (payload as { answers: unknown }).answers;

  if (!Array.isArray(answers)) {
    throw new Error("answers must be an array.");
  }

  const parsedAnswers: SubmittedAnswer[] = [];

  for (const answer of answers) {
    if (!answer || typeof answer !== "object") {
      throw new Error("Each answer must include a question number and selected answer.");
    }

    const questionNumber = Number((answer as { question_number?: unknown }).question_number);
    const selectedAnswer = String(
      (answer as { selected_answer?: unknown }).selected_answer ?? "",
    ).toUpperCase();

    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      throw new Error("Question numbers must be positive integers.");
    }

    if (!answerOptions.includes(selectedAnswer as ExamCorrectAnswer)) {
      throw new Error("Selected answers must be A, B, C, D, or E.");
    }

    parsedAnswers.push({
      question_number: questionNumber,
      selected_answer: selectedAnswer as ExamCorrectAnswer,
    });
  }

  return parsedAnswers;
}

export async function POST(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let submittedAnswers: SubmittedAnswer[];

  try {
    submittedAnswers = parseSubmittedAnswers(await request.json());
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to parse submitted answers.",
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

    const { data: answerKeyRows, error: answerKeyError } = await supabase
      .from("exam_answer_keys")
      .select("question_number,correct_answer,instructional_area")
      .eq("resource_id", id)
      .order("question_number", { ascending: true });

    if (answerKeyError) {
      return NextResponse.json({ error: answerKeyError.message }, { status: 500 });
    }

    if (!answerKeyRows?.length) {
      return NextResponse.json(
        { error: "This exam is not ready for grading yet." },
        { status: 409 },
      );
    }

    const submittedByQuestion = new Map(
      submittedAnswers.map((answer) => [answer.question_number, answer.selected_answer]),
    );
    const totalQuestions = answerKeyRows.length;
    let score = 0;

    const gradedAnswers = answerKeyRows.map((answerKey) => {
      const selectedAnswer =
        submittedByQuestion.get(answerKey.question_number) ?? "UNANSWERED";
      const isCorrect = selectedAnswer === answerKey.correct_answer;

      if (isCorrect) {
        score += 1;
      }

      return {
        question_number: answerKey.question_number,
        selected_answer: selectedAnswer as ExamSelectedAnswer,
        correct_answer: answerKey.correct_answer,
        is_correct: isCorrect,
        instructional_area: answerKey.instructional_area,
      };
    });

    const percentage =
      totalQuestions > 0 ? Number(((score / totalQuestions) * 100).toFixed(2)) : 0;

    const { data: attempt, error: attemptError } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: user.id,
        resource_id: id,
        score,
        total_questions: totalQuestions,
        percentage,
      })
      .select("id")
      .single();

    if (attemptError) {
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    const { error: answersError } = await supabase.from("exam_attempt_answers").insert(
      gradedAnswers.map((answer) => ({
        attempt_id: attempt.id,
        ...answer,
      })),
    );

    if (answersError) {
      await supabase.from("exam_attempts").delete().eq("id", attempt.id);
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    return NextResponse.json({ attemptId: attempt.id });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to submit this exam attempt.",
      },
      { status: 500 },
    );
  }
}
