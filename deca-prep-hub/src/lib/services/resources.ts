import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ResourceApprovalStatus,
  ResourceListItem,
  ResourceMetadataUpdate,
  SupabaseResourceType,
} from "@/lib/types";

const resourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,confidence_score,import_notes,file_path,storage_path";
const resourceColumnsWithCreatedAt = `${resourceColumns},created_at`;

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
  async listResources({
    approvalStatus,
    resourceType,
  }: {
    approvalStatus?: ResourceApprovalStatus;
    resourceType?: SupabaseResourceType;
  } = {}): Promise<ResourceListItem[]> {
    const supabase = getSupabaseClient();

    let query = supabase
      .from("resources")
      .select(resourceColumns)
      .order("year", { ascending: false })
      .order("title", { ascending: true });

    if (resourceType) {
      query = query.eq("resource_type", resourceType);
    }

    if (approvalStatus) {
      query = query.eq("approval_status", approvalStatus);
    }

    const { data, error } = await withDebugTimeout(query, "Resources list");

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  },

  async listApprovedRoleplays(): Promise<ResourceListItem[]> {
    return this.listResources({
      approvalStatus: "approved",
      resourceType: "roleplay",
    });
  },

  async listApprovedExams(): Promise<ResourceListItem[]> {
    return this.listResources({
      approvalStatus: "approved",
      resourceType: "exam",
    });
  },

  async listRecentApprovedResources(limit = 6): Promise<ResourceListItem[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(resourceColumnsWithCreatedAt)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(limit),
      "Recent approved resources",
    );

    if (!error) {
      return data ?? [];
    }

    console.warn("Recent approved resources query failed:", error.message);

    const fallbackResources = await this.listResources({
      approvalStatus: "approved",
    });

    return fallbackResources.slice(0, limit);
  },

  async getResourceById(id: string): Promise<ResourceListItem | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase.from("resources").select(resourceColumns).eq("id", id).maybeSingle(),
      "Resource detail",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  async createResourceSignedUrl(resource: ResourceListItem): Promise<string | null> {
    const supabase = getSupabaseClient();
    const storagePath = resource.storage_path ?? resource.file_path;

    if (!storagePath) {
      return null;
    }

    const { data, error } = await supabase.storage
      .from("resources")
      .createSignedUrl(storagePath, 60 * 60);

    if (error) {
      throw new Error(error.message);
    }

    return data.signedUrl;
  },

  async updateApprovalStatus(
    id: string,
    approvalStatus: "approved" | "rejected",
  ): Promise<ResourceListItem> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .update({ approval_status: approvalStatus })
        .eq("id", id)
        .select(resourceColumns)
        .single(),
      "Update resource approval status",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  async bulkApprove(ids: string[]): Promise<ResourceListItem[]> {
    if (ids.length === 0) {
      return [];
    }

    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .update({ approval_status: "approved" })
        .in("id", ids)
        .select(resourceColumns),
      "Bulk approve resources",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  },

  async updateMetadata(id: string, metadata: ResourceMetadataUpdate): Promise<ResourceListItem> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .update(metadata)
        .eq("id", id)
        .select(resourceColumns)
        .single(),
      "Update resource metadata",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },
};
