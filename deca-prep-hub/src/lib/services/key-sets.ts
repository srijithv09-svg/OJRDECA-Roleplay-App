import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { KeySet } from "@/lib/types";

const keySetColumns = "id,event_id,title,description,sort_order,status,created_at,updated_at";

export const KeySetsService = {
  async getApprovedKeySetsForEvent(eventId: string): Promise<KeySet[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("key_sets")
      .select(keySetColumns)
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      logDeveloperError("[key sets] approved key sets failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load key sets."));
    }

    return data ?? [];
  },
};
