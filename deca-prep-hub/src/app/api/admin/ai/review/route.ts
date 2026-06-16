import { NextResponse } from "next/server";
import { requireAdminRequester } from "@/lib/server/api-auth";
import type { Database, Json, ReviewableContentStatus, RubricCriterion } from "@/lib/types";
import {
  addPerformanceIndicator,
  updatePerformanceIndicator,
} from "@/lib/services/roleplay-performance-indicators";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type ReviewEntity =
  | "answer_key"
  | "question"
  | "roleplay"
  | "roleplay_performance_indicator"
  | "rubric";
type ReviewRequest = {
  entity?: unknown;
  id?: unknown;
  updates?: unknown;
};
type AddPerformanceIndicatorRequest = {
  entity?: unknown;
  input?: unknown;
  roleplay_scenario_id?: unknown;
};

const allowedStatuses = new Set<ReviewableContentStatus>([
  "draft",
  "needs_review",
  "approved",
  "archived",
  "rejected",
]);

function getAuthStatus(error: string) {
  return error.toLowerCase().includes("admin access") ? 403 : 401;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asOptionalString(value: unknown) {
  return value === null || value === undefined || typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return value === null || value === undefined || typeof value === "number" ? value : undefined;
}

function asJson(value: unknown): Json {
  JSON.stringify(value);
  return value as Json;
}

function parseStatus(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !allowedStatuses.has(value as ReviewableContentStatus)) {
    throw new Error("Invalid review status.");
  }

  return value as ReviewableContentStatus;
}

function parseEntity(value: unknown): ReviewEntity {
  if (
    value === "answer_key" ||
    value === "question" ||
    value === "roleplay" ||
    value === "roleplay_performance_indicator" ||
    value === "rubric"
  ) {
    return value;
  }

  throw new Error("Invalid review entity.");
}

function parsePossibleConcepts(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("possible_concepts must be an array.");
  }

  return asJson(value);
}

function parsePerformanceIndicatorUpdates(updates: Record<string, unknown>) {
  const status = parseStatus(updates.status);
  const text = asOptionalString(updates.text);

  if (text !== undefined && text !== null && text.trim().length === 0) {
    throw new Error("Performance indicator text cannot be empty.");
  }

  return {
    confidence: asOptionalNumber(updates.confidence),
    event_id: asOptionalString(updates.event_id),
    instructional_area: asOptionalString(updates.instructional_area),
    possible_concepts: parsePossibleConcepts(updates.possible_concepts),
    resource_id: asOptionalString(updates.resource_id),
    sort_order: asOptionalNumber(updates.sort_order),
    status,
    text,
    admin_reviewed: reviewedForStatus(status),
  };
}

function reviewedForStatus(status?: ReviewableContentStatus) {
  return status === "approved" ? true : status === undefined ? undefined : false;
}

function parseQuestionUpdates(updates: Record<string, unknown>) {
  const status = parseStatus(updates.status);

  return {
    choices: updates.choices === undefined ? undefined : asJson(updates.choices),
    concept_id: asOptionalString(updates.concept_id),
    correct_answer: updates.correct_answer === undefined ? undefined : asJson(updates.correct_answer),
    difficulty: asOptionalString(updates.difficulty),
    event_id: asOptionalString(updates.event_id),
    explanation: asOptionalString(updates.explanation),
    ladder_stage: asOptionalString(updates.ladder_stage),
    prompt: asOptionalString(updates.prompt),
    question_type: asOptionalString(updates.question_type),
    status,
    admin_reviewed: reviewedForStatus(status),
  };
}

function parseRoleplayUpdates(updates: Record<string, unknown>) {
  const status = parseStatus(updates.status);

  return {
    business_context: asOptionalString(updates.business_context),
    event_id: asOptionalString(updates.event_id),
    instructional_area: asOptionalString(updates.instructional_area),
    judge_role: asOptionalString(updates.judge_role),
    participant_role: asOptionalString(updates.participant_role),
    performance_indicators:
      updates.performance_indicators === undefined ? undefined : asJson(updates.performance_indicators),
    scenario_text: asOptionalString(updates.scenario_text),
    status,
    task: asOptionalString(updates.task),
    title: asOptionalString(updates.title),
    admin_reviewed: reviewedForStatus(status),
  };
}

function parseAnswerKeyUpdates(updates: Record<string, unknown>) {
  const status = parseStatus(updates.status);

  return {
    answers: updates.answers === undefined ? undefined : asJson(updates.answers),
    detected_event_code: asOptionalString(updates.detected_event_code),
    detected_year: asOptionalNumber(updates.detected_year),
    possible_exam_resource_id: asOptionalString(updates.possible_exam_resource_id),
    status,
    title: asOptionalString(updates.title),
    admin_reviewed: reviewedForStatus(status),
  };
}

type CriteriaUpdate = {
  description?: string | null;
  id?: string;
  max_points?: number | null;
  name: string;
  performance_levels?: Json | null;
  sort_order?: number;
};

function parseRubricUpdates(updates: Record<string, unknown>) {
  const status = parseStatus(updates.status);
  const criteria = updates.criteria;

  if (criteria !== undefined && !Array.isArray(criteria)) {
    throw new Error("Rubric criteria must be an array.");
  }

  return {
    rubric: {
      event_id: asOptionalString(updates.event_id),
      rubric_type: asOptionalString(updates.rubric_type),
      status,
      title: asOptionalString(updates.title),
      admin_reviewed: reviewedForStatus(status),
    },
    criteria:
      criteria?.map((criterion): CriteriaUpdate => {
        if (!isRecord(criterion) || typeof criterion.name !== "string") {
          throw new Error("Each rubric criterion must include a name.");
        }

        return {
          description: asOptionalString(criterion.description),
          id: asString(criterion.id) ?? undefined,
          max_points: asOptionalNumber(criterion.max_points),
          name: criterion.name,
          performance_levels:
            criterion.performance_levels === undefined ? undefined : asJson(criterion.performance_levels),
          sort_order:
            typeof criterion.sort_order === "number" ? criterion.sort_order : undefined,
        };
      }) ?? undefined,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

export async function PATCH(request: Request) {
  const { error: authError } = await requireAdminRequester(request);

  if (authError) {
    return NextResponse.json(
      { error: authError },
      { status: getAuthStatus(authError) },
    );
  }

  let body: ReviewRequest;

  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const entity = parseEntity(body.entity);
    const id = asString(body.id);

    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    if (!isRecord(body.updates)) {
      return NextResponse.json({ error: "updates must be an object." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    if (entity === "question") {
      const updates = stripUndefined(parseQuestionUpdates(body.updates)) as Database["public"]["Tables"]["questions"]["Update"];
      const { data, error } = await supabase
        .from("questions")
        .update(updates)
        .eq("id", id)
        .eq("ai_extracted", true)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ question: data });
    }

    if (entity === "roleplay") {
      const updates = stripUndefined(parseRoleplayUpdates(body.updates)) as Database["public"]["Tables"]["roleplay_scenarios"]["Update"];
      const { data, error } = await supabase
        .from("roleplay_scenarios")
        .update(updates)
        .eq("id", id)
        .eq("ai_extracted", true)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ roleplay: data });
    }

    if (entity === "roleplay_performance_indicator") {
      const updates = stripUndefined(
        parsePerformanceIndicatorUpdates(body.updates),
      ) as Database["public"]["Tables"]["roleplay_performance_indicators"]["Update"];
      const data = await updatePerformanceIndicator(supabase, id, updates);

      return NextResponse.json({ performanceIndicator: data });
    }

    if (entity === "answer_key") {
      const updates = stripUndefined(parseAnswerKeyUpdates(body.updates)) as Database["public"]["Tables"]["ai_extracted_answer_keys"]["Update"];
      const { data, error } = await supabase
        .from("ai_extracted_answer_keys")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ answerKey: data });
    }

    const { rubric, criteria } = parseRubricUpdates(body.updates);
    const { data: updatedRubric, error: rubricError } = await supabase
      .from("rubrics")
      .update(stripUndefined(rubric) as Database["public"]["Tables"]["rubrics"]["Update"])
      .eq("id", id)
      .eq("ai_extracted", true)
      .select()
      .single();

    if (rubricError) throw rubricError;

    let updatedCriteria: RubricCriterion[] = [];

    if (criteria) {
      for (const criterion of criteria) {
        const payload: Database["public"]["Tables"]["rubric_criteria"]["Insert"] = {
          rubric_id: id,
          name: criterion.name,
          description: criterion.description ?? null,
          max_points: criterion.max_points ?? null,
          performance_levels: criterion.performance_levels ?? null,
          sort_order: criterion.sort_order ?? 0,
        };

        if (criterion.id) {
          const { error } = await supabase
            .from("rubric_criteria")
            .update(payload)
            .eq("id", criterion.id)
            .eq("rubric_id", id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("rubric_criteria").insert(payload);

          if (error) throw error;
        }
      }

      const { data, error } = await supabase
        .from("rubric_criteria")
        .select()
        .eq("rubric_id", id)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      updatedCriteria = data ?? [];
    }

    return NextResponse.json({ criteria: updatedCriteria, rubric: updatedRubric });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update AI review item." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const { error: authError } = await requireAdminRequester(request);

  if (authError) {
    return NextResponse.json(
      { error: authError },
      { status: getAuthStatus(authError) },
    );
  }

  let body: AddPerformanceIndicatorRequest;

  try {
    body = (await request.json()) as AddPerformanceIndicatorRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    if (body.entity !== "roleplay_performance_indicator") {
      throw new Error("Invalid review entity.");
    }

    const roleplayScenarioId = asString(body.roleplay_scenario_id);

    if (!roleplayScenarioId) {
      return NextResponse.json({ error: "roleplay_scenario_id is required." }, { status: 400 });
    }

    if (!isRecord(body.input)) {
      return NextResponse.json({ error: "input must be an object." }, { status: 400 });
    }

    const text = asString(body.input.text);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: scenario, error: scenarioError } = await supabase
      .from("roleplay_scenarios")
      .select("id,resource_id,event_id,instructional_area")
      .eq("id", roleplayScenarioId)
      .single();

    if (scenarioError || !scenario) {
      throw scenarioError ?? new Error("Roleplay scenario was not found.");
    }

    const { data: existingIndicators, error: indicatorError } = await supabase
      .from("roleplay_performance_indicators")
      .select("sort_order")
      .eq("roleplay_scenario_id", roleplayScenarioId)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (indicatorError) {
      throw indicatorError;
    }

    const nextSortOrder = (existingIndicators?.[0]?.sort_order ?? -1) + 1;
    const performanceIndicator = await addPerformanceIndicator(supabase, {
      confidence: asOptionalNumber(body.input.confidence) ?? null,
      event_id: scenario.event_id,
      instructional_area:
        asOptionalString(body.input.instructional_area) ?? scenario.instructional_area,
      possible_concepts: parsePossibleConcepts(body.input.possible_concepts) ?? [],
      resource_id: scenario.resource_id,
      roleplay_scenario_id: roleplayScenarioId,
      sort_order: nextSortOrder,
      status: parseStatus(body.input.status) ?? "needs_review",
      text,
    });

    return NextResponse.json({ performanceIndicator }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add performance indicator." },
      { status: 400 },
    );
  }
}
