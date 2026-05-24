import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ResourceApprovalStatus,
  ResourceListItem,
  SupabaseResourceType,
} from "@/lib/types";

const resourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,confidence_score,import_notes,file_path,storage_path";

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
};
