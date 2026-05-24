import { getSupabaseClient } from "@/lib/supabase/client";
import type { ResourceListItem } from "@/lib/types";

const resourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status";

async function withDebugTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} request timed out after 10 seconds.`));
    }, 10000);
  });

  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export const ResourcesService = {
  async listApprovedRoleplays(): Promise<ResourceListItem[]> {
    const supabase = getSupabaseClient();

    console.log("[ResourcesService] Fetching approved roleplays from resources");

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(resourceColumns)
        .eq("resource_type", "roleplay")
        .eq("approval_status", "approved")
        .order("year", { ascending: false })
        .order("title", { ascending: true }),
      "Approved roleplays",
    );

    console.log("[ResourcesService] Approved roleplays data:", data);

    if (error) {
      console.error("[ResourcesService] Approved roleplays error:", error);
      throw new Error(error.message);
    }

    return data ?? [];
  },

  async listApprovedExams(): Promise<ResourceListItem[]> {
    const supabase = getSupabaseClient();

    console.log("[ResourcesService] Fetching approved exams from resources");

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(resourceColumns)
        .eq("resource_type", "exam")
        .eq("approval_status", "approved")
        .order("year", { ascending: false })
        .order("title", { ascending: true }),
      "Approved exams",
    );

    console.log("[ResourcesService] Approved exams data:", data);

    if (error) {
      console.error("[ResourcesService] Approved exams error:", error);
      throw new Error(error.message);
    }

    return data ?? [];
  },
};
