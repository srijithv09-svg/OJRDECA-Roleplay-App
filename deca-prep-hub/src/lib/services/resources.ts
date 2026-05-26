import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ResourceApprovalStatus,
  ResourceListItem,
  ResourceMetadataUpdate,
  SupabaseResourceType,
} from "@/lib/types";

const resourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,performance_indicators_reviewed,confidence_score,import_notes,file_path,storage_path";
const resourceColumnsWithCreatedAt = `${resourceColumns},created_at`;
const publicResourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,performance_indicators_reviewed";

export type PublicResourceListItem = Omit<
  ResourceListItem,
  "confidence_score" | "import_notes" | "file_path" | "storage_path"
> &
  Partial<Pick<ResourceListItem, "confidence_score" | "import_notes" | "file_path" | "storage_path">>;
export type RecentPublicResourceListItem = PublicResourceListItem & {
  created_at: string | null;
};

export type ResourceDashboardSummary = {
  approvedRoleplays: number;
  approvedExams: number;
  approvedResources: number;
  pendingResources: number;
  rejectedResources: number;
  recentApprovedResources: RecentPublicResourceListItem[];
};

export type ResourcePdfLinkResult = {
  signedUrl: string;
};

export type ResourcePdfRepairResult = {
  resource: ResourceListItem;
  signedUrl: string | null;
  storagePath: string;
  updated: boolean;
};

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

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in to open resource PDFs.");
  }

  return data.session.access_token;
}

async function fetchResourcePdfEndpoint<T>(id: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(`/api/resources/${id}/pdf`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load the resource PDF.");
  }

  return payload;
}

async function getResourceCount({
  approvalStatus,
  resourceType,
}: {
  approvalStatus?: ResourceApprovalStatus;
  resourceType?: SupabaseResourceType;
}) {
  const supabase = getSupabaseClient();

  let query = supabase.from("resources").select("id", { count: "exact", head: true });

  if (approvalStatus) {
    query = query.eq("approval_status", approvalStatus);
  }

  if (resourceType) {
    query = query.eq("resource_type", resourceType);
  }

  const { count, error } = await withDebugTimeout(query, "Resource count");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
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

  async listApprovedPublicResources({
    resourceType,
  }: {
    resourceType: SupabaseResourceType;
  }): Promise<PublicResourceListItem[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(publicResourceColumns)
        .eq("approval_status", "approved")
        .eq("resource_type", resourceType)
        .order("year", { ascending: false })
        .order("title", { ascending: true }),
      "Approved public resources",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
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

  async listRecentApprovedPublicResources(limit = 5): Promise<RecentPublicResourceListItem[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(`${publicResourceColumns},created_at`)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(limit),
      "Recent approved public resources",
    );

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((resource) => ({
      ...resource,
      created_at: resource.created_at ?? null,
    }));
  },

  async getDashboardSummary({ includeAdmin = false } = {}): Promise<ResourceDashboardSummary> {
    const [
      approvedRoleplays,
      approvedExams,
      approvedResources,
      recentApprovedResources,
      pendingResources,
      rejectedResources,
    ] = await Promise.all([
      getResourceCount({ approvalStatus: "approved", resourceType: "roleplay" }),
      getResourceCount({ approvalStatus: "approved", resourceType: "exam" }),
      getResourceCount({ approvalStatus: "approved" }),
      this.listRecentApprovedPublicResources(),
      includeAdmin ? getResourceCount({ approvalStatus: "pending" }) : Promise.resolve(0),
      includeAdmin ? getResourceCount({ approvalStatus: "rejected" }) : Promise.resolve(0),
    ]);

    return {
      approvedRoleplays,
      approvedExams,
      approvedResources,
      pendingResources,
      rejectedResources,
      recentApprovedResources,
    };
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

  async getApprovedPublicResourceById(id: string): Promise<PublicResourceListItem | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .select(publicResourceColumns)
        .eq("id", id)
        .eq("approval_status", "approved")
        .maybeSingle(),
      "Approved resource detail",
    );

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  async getResourcePdfLink(id: string): Promise<ResourcePdfLinkResult> {
    return fetchResourcePdfEndpoint<ResourcePdfLinkResult>(id);
  },

  async repairResourcePdfPath(id: string): Promise<ResourcePdfRepairResult> {
    return fetchResourcePdfEndpoint<ResourcePdfRepairResult>(id, {
      method: "POST",
    });
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

  async bulkReject(ids: string[]): Promise<ResourceListItem[]> {
    if (ids.length === 0) {
      return [];
    }

    const supabase = getSupabaseClient();

    const { data, error } = await withDebugTimeout(
      supabase
        .from("resources")
        .update({ approval_status: "rejected" })
        .in("id", ids)
        .select(resourceColumns),
      "Bulk reject resources",
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
