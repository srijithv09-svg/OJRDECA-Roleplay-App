import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RoleplayScenario } from "@/lib/types";

const roleplayScenarioColumns =
  "id,resource_id,event_id,title,scenario_text,participant_role,judge_role,business_context,task,instructional_area,performance_indicators,status,ai_extracted,admin_reviewed,created_at,updated_at";

export const RoleplayScenariosService = {
  async getApprovedRoleplayScenariosForEvent(eventId: string): Promise<RoleplayScenario[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("roleplay_scenarios")
      .select(roleplayScenarioColumns)
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      logDeveloperError("[roleplay scenarios] approved scenarios failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load roleplay scenarios."));
    }

    return data ?? [];
  },
};
