import { NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth";
import {
  generateRoleplayTranscriptFeedback,
  RoleplayFeedbackError,
} from "@/lib/ai/grading/roleplay-transcript-feedback";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { toJson } from "@/lib/server/concept-feedback-attempts";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database, Profile, RoleplayAttempt } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const attemptColumns =
  "id,user_id,resource_id,response_notes,performance_indicator_notes,self_reflection,judge_feedback,audio_path,transcript,transcript_status,ai_feedback_status,ai_overall_score,ai_feedback_json,strengths,growth_areas,confidence_rating,created_at,updated_at";
const resourceColumns =
  "id,title,cluster,event_code,event_name,event_category,year,resource_type,approval_status,original_filename,performance_indicators,performance_indicators_reviewed";
const profileColumns = "id,email,role,created_at,updated_at";
const scenarioColumns =
  "id,resource_id,event_id,title,scenario_text,participant_role,judge_role,business_context,task,instructional_area,performance_indicators,status,ai_extracted,admin_reviewed,created_at,updated_at";
const indicatorColumns =
  "id,roleplay_scenario_id,resource_id,event_id,text,instructional_area,possible_concepts,confidence,sort_order,status,ai_extracted,admin_reviewed,created_at,updated_at";
const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const rubricColumns =
  "id,resource_id,event_id,ai_extraction_job_id,title,rubric_type,status,ai_extracted,admin_reviewed,created_at,updated_at";
const rubricCriteriaColumns =
  "id,rubric_id,name,description,max_points,performance_levels,sort_order,created_at,updated_at";

function jsonError(message: string, status: number, code = "roleplay_feedback_error", extra = {}) {
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

function trimmed(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function getStudentResponse(attempt: RoleplayAttempt) {
  return trimmed(attempt.transcript) ?? trimmed(attempt.response_notes);
}

function supportingContext(attempt: RoleplayAttempt) {
  return [
    attempt.performance_indicator_notes
      ? `Performance indicator notes: ${attempt.performance_indicator_notes}`
      : null,
    attempt.self_reflection ? `Self-reflection: ${attempt.self_reflection}` : null,
    attempt.confidence_rating ? `Student confidence rating: ${attempt.confidence_rating}/5` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function errorStatus(code: string) {
  if (code === "gemini_quota_exceeded") {
    return 429;
  }

  if (code === "gemini_timeout") {
    return 504;
  }

  return 503;
}

export async function POST(request: Request, context: RouteContext) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return jsonError(authError ?? "Unauthorized.", 401, "unauthorized");
  }

  const { id: attemptId } = await context.params;
  const supabase = getSupabaseAdminClient();

  try {
    const [{ data: attempt, error: attemptError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase.from("roleplay_attempts").select(attemptColumns).eq("id", attemptId).maybeSingle(),
        supabase.from("profiles").select(profileColumns).eq("id", user.id).maybeSingle(),
      ]);

    if (attemptError || profileError) {
      throw new Error((attemptError ?? profileError)?.message);
    }

    if (!attempt) {
      return jsonError("This saved roleplay attempt could not be found.", 404, "attempt_not_found");
    }

    const isAdminOrAdvisor = isAdminRole((profile as Profile | null)?.role);

    if (attempt.user_id !== user.id && !isAdminOrAdvisor) {
      return jsonError("You can only request feedback for your own roleplay attempts.", 403, "forbidden");
    }

    if (attempt.ai_feedback_status === "pending") {
      return jsonError("AI feedback is already being generated for this attempt.", 409, "feedback_processing");
    }

    if (attempt.ai_feedback_status === "complete" && attempt.ai_feedback_json) {
      return NextResponse.json({
        attempt,
        feedback: attempt.ai_feedback_json,
        ok: true,
        reused: true,
        warnings: [],
      });
    }

    const studentResponse = getStudentResponse(attempt);

    if (!studentResponse) {
      return jsonError(
        "Add a transcript or written response before requesting AI feedback.",
        400,
        "missing_student_response",
      );
    }

    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select(resourceColumns)
      .eq("id", attempt.resource_id)
      .maybeSingle();

    if (resourceError) {
      throw new Error(resourceError.message);
    }

    if (!resource) {
      return jsonError("This roleplay resource could not be found.", 404, "resource_not_found");
    }

    const { data: event } = resource.event_code
      ? await supabase
          .from("events")
          .select(eventColumns)
          .eq("code", resource.event_code)
          .maybeSingle()
      : { data: null };

    const { data: scenarios, error: scenarioError } = await supabase
      .from("roleplay_scenarios")
      .select(scenarioColumns)
      .eq("resource_id", attempt.resource_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1);

    if (scenarioError) {
      throw new Error(scenarioError.message);
    }

    const scenario = scenarios?.[0] ?? null;
    const warnings: string[] = [];

    if (!scenario) {
      warnings.push("No approved extracted scenario is attached yet. Feedback may be less specific.");
    }

    const { data: indicators, error: indicatorError } = scenario
      ? await supabase
          .from("roleplay_performance_indicators")
          .select(indicatorColumns)
          .eq("roleplay_scenario_id", scenario.id)
          .eq("status", "approved")
          .order("sort_order", { ascending: true })
      : await supabase
          .from("roleplay_performance_indicators")
          .select(indicatorColumns)
          .eq("resource_id", attempt.resource_id)
          .eq("status", "approved")
          .order("sort_order", { ascending: true });

    if (indicatorError) {
      throw new Error(indicatorError.message);
    }

    if (!indicators || indicators.length === 0) {
      warnings.push("No approved performance indicators are attached yet. PI coverage scoring may be limited.");
    }

    let rubricQuery = supabase
      .from("rubrics")
      .select(rubricColumns)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1);

    if (scenario?.event_id ?? event?.id) {
      rubricQuery = rubricQuery.or(
        `resource_id.eq.${attempt.resource_id},event_id.eq.${scenario?.event_id ?? event?.id}`,
      );
    } else {
      rubricQuery = rubricQuery.eq("resource_id", attempt.resource_id);
    }

    const { data: rubrics, error: rubricError } = await rubricQuery;

    if (rubricError) {
      throw new Error(rubricError.message);
    }

    const rubric = rubrics?.[0] ?? null;
    const { data: rubricCriteria, error: criteriaError } = rubric
      ? await supabase
          .from("rubric_criteria")
          .select(rubricCriteriaColumns)
          .eq("rubric_id", rubric.id)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (criteriaError) {
      throw new Error(criteriaError.message);
    }

    if (!rubric || !rubricCriteria || rubricCriteria.length === 0) {
      warnings.push("No approved rubric is attached yet. Rubric scoring uses general practice categories.");
    }

    await supabase
      .from("roleplay_attempts")
      .update({ ai_feedback_status: "pending" })
      .eq("id", attempt.id);

    try {
      const generated = await generateRoleplayTranscriptFeedback({
        aboveAndBeyondContext: resource.performance_indicators_reviewed
          ? "Use reviewed resource metadata only as supporting context."
          : null,
        approvedPerformanceIndicators: (indicators ?? []).map((indicator) => ({
          id: indicator.id,
          instructionalArea: indicator.instructional_area,
          text: indicator.text,
        })),
        approvedRubricCriteria: (rubricCriteria ?? []).map((criterion) => ({
          description: criterion.description,
          id: criterion.id,
          maxPoints: criterion.max_points,
          name: criterion.name,
        })),
        businessContext: scenario?.business_context ?? null,
        eventCode: event?.code ?? resource.event_code ?? null,
        eventName: event?.name ?? resource.event_name ?? null,
        instructionalArea: scenario?.instructional_area ?? resource.event_category ?? null,
        judgeRole: scenario?.judge_role ?? null,
        participantRole: scenario?.participant_role ?? null,
        roleplayTitle: scenario?.title ?? resource.title,
        scenarioText: scenario?.scenario_text ?? null,
        studentSupportingContext: supportingContext(attempt),
        studentTranscriptOrResponse: studentResponse,
        task: scenario?.task ?? null,
        warnings,
      });

      const feedbackJson = {
        ...generated.feedback,
        contextWarnings: warnings,
        generatedAt: new Date().toISOString(),
        model: generated.model,
        practiceOnly: true,
        roleplayScenarioId: scenario?.id ?? null,
        rubricId: rubric?.id ?? null,
      };

      const { data: updatedAttempt, error: updateError } = await supabase
        .from("roleplay_attempts")
        .update({
          ai_feedback_json: toJson(feedbackJson),
          ai_feedback_status: "complete",
          ai_overall_score: generated.feedback.overallScore,
          growth_areas: generated.feedback.growthAreas,
          judge_feedback: generated.feedback.feedbackSummary,
          strengths: generated.feedback.strengths,
        } satisfies Database["public"]["Tables"]["roleplay_attempts"]["Update"])
        .eq("id", attempt.id)
        .select(attemptColumns)
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      return NextResponse.json({
        attempt: updatedAttempt,
        feedback: feedbackJson,
        ok: true,
        reused: false,
        warnings,
      });
    } catch (error) {
      const normalized =
        error instanceof RoleplayFeedbackError
          ? error
          : new RoleplayFeedbackError(
              "gemini_api_error",
              error instanceof Error
                ? error.message
                : "AI feedback could not be generated right now. Your roleplay attempt was saved.",
            );

      await supabase
        .from("roleplay_attempts")
        .update({
          ai_feedback_json: toJson({
            code: normalized.code,
            message: normalized.message,
            retryAfterSeconds: normalized.retryAfterSeconds ?? null,
          }),
          ai_feedback_status: "failed",
        })
        .eq("id", attempt.id);

      return jsonError(normalized.message, errorStatus(normalized.code), normalized.code, {
        retryAfterSeconds: normalized.retryAfterSeconds,
      });
    }
  } catch (error) {
    await supabase
      .from("roleplay_attempts")
      .update({ ai_feedback_status: "failed" })
      .eq("id", attemptId);

    return jsonError(
      error instanceof Error ? error.message : "Unable to generate roleplay feedback.",
      500,
      "unexpected_roleplay_feedback_error",
    );
  }
}
