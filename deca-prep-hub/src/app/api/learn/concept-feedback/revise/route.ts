import { NextResponse } from "next/server";
import {
  ConceptFeedbackError,
  generateConceptRevisionFeedback,
} from "@/lib/ai/grading/concept-feedback";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import {
  toJson,
  upsertConceptMasteryFromRevision,
} from "@/lib/server/concept-feedback-attempts";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,created_at,updated_at";
const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const feedbackAttemptColumns =
  "id,user_id,question_id,concept_id,event_id,original_response,ai_feedback_json,ai_feedback_summary,revised_response,revision_feedback_json,improvement_summary,score,revision_score,status,created_at,updated_at";

type RequestBody = {
  feedback_attempt_id?: unknown;
  revised_response?: unknown;
};

function jsonError(message: string, status: number, code = "concept_revision_error", extra = {}) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...extra,
      },
      ok: false,
    },
    { status },
  );
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return jsonError(authError ?? "Unauthorized.", 401, "unauthorized");
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400, "invalid_json");
  }

  const feedbackAttemptId = normalizeText(body.feedback_attempt_id);
  const revisedResponse = normalizeText(body.revised_response);

  if (!feedbackAttemptId) {
    return jsonError("feedback_attempt_id is required.", 400, "missing_feedback_attempt_id");
  }

  if (revisedResponse.length < 20) {
    return jsonError("Write a fuller revision before requesting revision feedback.", 400, "revision_too_short");
  }

  const supabase = getSupabaseAdminClient();

  try {
    const { data: attempt, error: attemptError } = await supabase
      .from("concept_feedback_attempts")
      .select(feedbackAttemptColumns)
      .eq("id", feedbackAttemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    if (!attempt) {
      return jsonError("Feedback attempt was not found for the current user.", 404, "feedback_attempt_not_found");
    }

    if (!attempt.ai_feedback_json) {
      return jsonError("Revision feedback requires a completed first feedback attempt.", 400, "missing_original_feedback");
    }

    const [{ data: concept, error: conceptError }, questionResult, eventResult] = await Promise.all([
      supabase
        .from("concepts")
        .select(conceptColumns)
        .eq("id", attempt.concept_id)
        .eq("status", "approved")
        .maybeSingle(),
      attempt.question_id
        ? supabase
            .from("questions")
            .select(questionColumns)
            .eq("id", attempt.question_id)
            .eq("status", "approved")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      attempt.event_id
        ? supabase.from("events").select(eventColumns).eq("id", attempt.event_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (conceptError || questionResult.error || eventResult.error) {
      throw new Error((conceptError ?? questionResult.error ?? eventResult.error)?.message);
    }

    if (!concept) {
      return jsonError("This concept is not available for learning practice.", 404, "concept_not_found");
    }

    try {
      const generated = await generateConceptRevisionFeedback({
        conceptDefinition: concept.student_friendly_definition,
        conceptExample: concept.example,
        conceptExplanation: concept.detailed_explanation,
        conceptName: concept.name,
        eventCode: eventResult.data?.code ?? null,
        eventName: eventResult.data?.name ?? null,
        originalFeedbackSummary: attempt.ai_feedback_summary,
        originalResponse: attempt.original_response,
        questionPrompt: questionResult.data?.prompt ?? null,
        revisedResponse,
        scenarioContext: questionResult.data?.explanation ?? null,
        studentResponse: attempt.original_response,
      });

      const { data: updatedAttempt, error: updateError } = await supabase
        .from("concept_feedback_attempts")
        .update({
          improvement_summary: generated.feedback.improvementSummary,
          revised_response: revisedResponse,
          revision_feedback_json: toJson(generated.feedback),
          revision_score: generated.feedback.revisedScore,
          status: "completed",
        })
        .eq("id", attempt.id)
        .eq("user_id", user.id)
        .select(feedbackAttemptColumns)
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      const mastery = await upsertConceptMasteryFromRevision({
        conceptId: attempt.concept_id,
        improvementScore: generated.feedback.improvementScore,
        revisedScore: generated.feedback.revisedScore,
        supabase,
        userId: user.id,
      });

      return NextResponse.json({
        feedbackAttempt: updatedAttempt,
        mastery,
        ok: true,
        revisionFeedback: generated.feedback,
      });
    } catch (error) {
      if (error instanceof ConceptFeedbackError) {
        return jsonError(error.message, error.code === "gemini_quota_exceeded" ? 429 : 503, error.code, {
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      throw error;
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to generate revision feedback.",
      500,
      "unexpected_concept_revision_error",
    );
  }
}
