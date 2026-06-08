import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DecaEvent } from "@/lib/types";

const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";

export const EventsService = {
  async getPilotEvents(): Promise<DecaEvent[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("events")
      .select(eventColumns)
      .eq("is_pilot", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      logDeveloperError("[events] pilot events failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load pilot events."));
    }

    return data ?? [];
  },

  async getEventByCode(code: string): Promise<DecaEvent | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("events")
      .select(eventColumns)
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (error) {
      logDeveloperError("[events] event by code failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load this event."));
    }

    return data;
  },
};
