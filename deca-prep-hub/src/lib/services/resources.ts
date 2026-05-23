import { getSupabaseClient } from "@/lib/supabase/client";
import type { ResourceListItem, SupabaseResourceType } from "@/lib/types";

const resourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type";

export const ResourcesService = {
  async listByType(resourceType: SupabaseResourceType): Promise<ResourceListItem[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("resources")
      .select(resourceColumns)
      .eq("resource_type", resourceType)
      .order("year", { ascending: false })
      .order("title", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  },
};
