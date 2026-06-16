import { NextResponse } from "next/server";
import { ConceptFeedbackError, generateConceptFeedback } from "@/lib/ai/grading/concept-feedback";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import {
  toJson,
  upsertConceptMasteryFromFeedback,
} from "@/lib/server/concept-feedback-attempts";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { DecaEvent, StructuredQuestion } from "@/lib/types";

const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,created_at,updated_at";
const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const feedbackAttemptColumns =
  "id,user_id,question_id,concept_id,event_id,original_response,ai_feedback_json,ai_feedback_summary,revised_response,revision_feedback_json,improvement_summary,score,revision_score,status,created_at,updated_at";

type RequestBody = {
  concept_id?: unknown;
  event_code?: unknown;
  question_id?: unknown;
  response_text?: unknown;
};

function jsonError(message: string, status: number, code = "concept_feedback_error", extra = {}) {
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

  const conceptId = normalizeText(body.concept_id);
  const questionId = normalizeText(body.question_id);
  const eventCode = normalizeText(body.event_code);
  const responseText = normalizeText(body.response_text);

  if (!conceptId) {
    return jsonError("concept_id is required.", 400, "missing_concept_id");
  }

  if (responseText.length < 20) {
    return jsonError("Write a little more before requesting practice feedback.", 400, "response_too_short");
  }

  const supabase = getSupabaseAdminClient();

  try {
    const { data: concept, error: conceptError } = await supabase
      .from("concepts")
      .select(conceptColumns)
      .eq("id", conceptId)
      .eq("status", "approved")
      .maybeSingle();

    if (conceptError) {
      throw new Error(conceptError.message);
    }

    if (!concept) {
      return jsonError("This concept is not available for learning practice.", 404, "concept_not_found");
    }

    let question: StructuredQuestion | null = null;

    if (questionId) {
      const { data, error } = await supabase
        .from("questions")
        .select(questionColumns)
        .eq("id", questionId)
        .eq("concept_id", conceptId)
        .eq("status", "approved")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return jsonError("This question is not available for learning practice.", 404, "question_not_found");
      }

      if (data.question_type !== "free_text") {
        return jsonError("AI concept feedback is only available for free-text questions.", 400, "unsupported_question_type");
      }

      question = data;
    }

    let event: DecaEvent | null = null;
    const eventId = question?.event_id ?? null;

    if (eventId) {
      const { data, error } = await supabase
        .from("events")
        .select(eventColumns)
        .eq("id", eventId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      event = data;
    } else if (eventCode) {
      const { data, error } = await supabase
        .from("events")
        .select(eventColumns)
        .eq("code", eventCode.toUpperCase())
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      event = data;
    }

    let duplicateQuery = supabase
      .from("concept_feedback_attempts")
      .select(feedbackAttemptColumns)
      .eq("user_id", user.id)
      .eq("concept_id", conceptId)
      .eq("original_response", responseText)
      .not("ai_feedback_json", "is", null)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (questionId) {
      duplicateQuery = duplicateQuery.eq("question_id", questionId);
    }

    const { data: duplicates, error: duplicateError } = await duplicateQuery;

    if (duplicateError) {
      throw new Error(duplicateError.message);
    }

    const duplicate = duplicates?.[0] ?? null;

    if (duplicate) {
      return NextResponse.json({
        duplicate: true,
        feedback: duplicate.ai_feedback_json,
        feedbackAttempt: duplicate,
        mastery: null,
        ok: true,
      });
    }

    try {
      const generated = await generateConceptFeedback({
        conceptDefinition: concept.student_friendly_definition,
        conceptExample: concept.example,
        conceptExplanation: concept.detailed_explanation,
        conceptName: concept.name,
        eventCode: event?.code ?? null,
        eventName: event?.name ?? null,
        questionPrompt: question?.prompt ?? null,
        scenarioContext: question?.explanation ?? null,
        studentResponse: responseText,
      });

      const { data: feedbackAttempt, error: insertError } = await supabase
        .from("concept_feedback_attempts")
        .insert({
          ai_feedback_json: toJson(generated.feedback),
          ai_feedback_summary: generated.feedback.feedbackSummary,
          concept_id: conceptId,
          event_id: event?.id ?? question?.event_id ?? null,
          original_response: responseText,
          question_id: question?.id ?? null,
          score: generated.feedback.overallScore,
          status: "feedback_given",
          user_id: user.id,
        })
        .select(feedbackAttemptColumns)
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const mastery = await upsertConceptMasteryFromFeedback({
        conceptId,
        score: generated.feedback.overallScore,
        supabase,
        userId: user.id,
      });

      return NextResponse.json({
        duplicate: false,
        feedback: generated.feedback,
        feedbackAttempt,
        mastery,
        ok: true,
      });
    } catch (error) {
      if (error instanceof ConceptFeedbackError) {
        await supabase.from("concept_feedback_attempts").insert({
          ai_feedback_summary: error.message,
          concept_id: conceptId,
          event_id: event?.id ?? question?.event_id ?? null,
          original_response: responseText,
          question_id: question?.id ?? null,
          status: "failed",
          user_id: user.id,
        });

        return jsonError(error.message, error.code === "gemini_quota_exceeded" ? 429 : 503, error.code, {
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      throw error;
    }
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unable to generate concept feedback.",
      500,
      "unexpected_concept_feedback_error",
    );
  }
}
