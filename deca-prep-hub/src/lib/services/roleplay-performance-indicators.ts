import "server-only";

import type {
  Database,
  Json,
  ReviewableContentStatus,
  RoleplayPerformanceIndicator,
} from "@/lib/types";
import type { SupabaseAdminClient } from "@/lib/ai/extraction/shared";

type IndicatorInsert = Database["public"]["Tables"]["roleplay_performance_indicators"]["Insert"];
type IndicatorUpdate = Database["public"]["Tables"]["roleplay_performance_indicators"]["Update"];

export type RoleplayPerformanceIndicatorInput = {
  confidence?: number | null;
  event_id?: string | null;
  instructional_area?: string | null;
  possible_concepts?: Json | null;
  resource_id?: string | null;
  roleplay_scenario_id: string;
  sort_order?: number;
  status?: ReviewableContentStatus;
  text: string;
};

function toCompatibilityJson(indicator: RoleplayPerformanceIndicator) {
  return {
    confidence: indicator.confidence,
    instructionalArea: indicator.instructional_area,
    possibleConcepts: indicator.possible_concepts ?? [],
    status: indicator.status,
    text: indicator.text,
  };
}

export async function syncRoleplayScenarioPerformanceIndicators(
  supabase: SupabaseAdminClient,
  roleplayScenarioId: string,
) {
  const { data, error } = await supabase
    .from("roleplay_performance_indicators")
    .select("*")
    .eq("roleplay_scenario_id", roleplayScenarioId)
    .neq("status", "archived")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const { error: updateError } = await supabase
    .from("roleplay_scenarios")
    .update({
      performance_indicators: (data ?? []).map(toCompatibilityJson) as Json,
    })
    .eq("id", roleplayScenarioId);

  if (updateError) {
    throw updateError;
  }

  return data ?? [];
}

export async function insertRoleplayPerformanceIndicators(
  supabase: SupabaseAdminClient,
  indicators: IndicatorInsert[],
) {
  if (indicators.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("roleplay_performance_indicators")
    .insert(indicators)
    .select("*");

  if (error) {
    throw error;
  }

  const scenarioIds = [...new Set((data ?? []).map((indicator) => indicator.roleplay_scenario_id))];

  for (const scenarioId of scenarioIds) {
    await syncRoleplayScenarioPerformanceIndicators(supabase, scenarioId);
  }

  return data ?? [];
}

export async function addPerformanceIndicator(
  supabase: SupabaseAdminClient,
  input: RoleplayPerformanceIndicatorInput,
) {
  const payload: IndicatorInsert = {
    ai_extracted: false,
    admin_reviewed: false,
    confidence: input.confidence ?? null,
    event_id: input.event_id ?? null,
    instructional_area: input.instructional_area ?? null,
    possible_concepts: input.possible_concepts ?? [],
    resource_id: input.resource_id ?? null,
    roleplay_scenario_id: input.roleplay_scenario_id,
    sort_order: input.sort_order ?? 0,
    status: input.status ?? "needs_review",
    text: input.text,
  };

  const { data, error } = await supabase
    .from("roleplay_performance_indicators")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncRoleplayScenarioPerformanceIndicators(supabase, input.roleplay_scenario_id);

  return data;
}

export async function updatePerformanceIndicator(
  supabase: SupabaseAdminClient,
  id: string,
  updates: IndicatorUpdate,
) {
  const { data, error } = await supabase
    .from("roleplay_performance_indicators")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncRoleplayScenarioPerformanceIndicators(supabase, data.roleplay_scenario_id);

  return data;
}

export async function setPerformanceIndicatorStatus(
  supabase: SupabaseAdminClient,
  id: string,
  status: ReviewableContentStatus,
) {
  return updatePerformanceIndicator(supabase, id, {
    admin_reviewed: status === "approved",
    status,
  });
}
