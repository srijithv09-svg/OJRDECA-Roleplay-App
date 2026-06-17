import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Concept,
  CurriculumDraftItem,
  CurriculumDraftJob,
  DecaEvent,
  KeySet,
  KeySetConcept,
  RoleplayPerformanceIndicator,
  StructuredQuestion,
  StudyResource,
} from "@/lib/types";

export type AdminContentStudioData = {
  concepts: Concept[];
  events: DecaEvent[];
  keySetConcepts: KeySetConcept[];
  keySets: KeySet[];
  questions: StructuredQuestion[];
  roleplayPerformanceIndicators: RoleplayPerformanceIndicator[];
  curriculumDraftJobs: CurriculumDraftJob[];
  curriculumDraftItems: CurriculumDraftItem[];
  reviewQueue: {
    conceptsDraft: number;
    keySetsDraft: number;
    questionsNeedsReview: number;
    studyResourcesNeedsReview: number;
  };
  studyResources: StudyResource[];
};

type AdminContentAction =
  | "duplicateQuestion"
  | "saveConcept"
  | "saveKeySet"
  | "saveQuestion"
  | "saveStudyResource";

export type CurriculumDraftRequest = {
  admin_notes?: string;
  cluster: string;
  coverage_mode: "fill_gaps" | "create_new_module" | "expand_existing_module";
  desired_module_count?: number;
  difficulty?: "beginner" | "intermediate" | "advanced";
  event_id?: string;
  pasted_performance_indicators?: string;
  questions_per_concept?: number;
  selected_performance_indicator_ids?: string[];
  source_type: "extracted_pi" | "manual_paste";
  target_key_set_id?: string;
};

export type CurriculumDraftResponse = {
  created: {
    concepts: string[];
    keySets: string[];
    questions: string[];
  };
  jobId: string;
  summary: {
    coveredPerformanceIndicators: string[];
    missingOrSkippedPerformanceIndicators: string[];
    modulesDrafted: number;
    notes: string[];
    questionsDrafted: number;
  };
};

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    logDeveloperError("[admin content] session lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to verify your session."));
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in as an admin or advisor.");
  }

  return data.session.access_token;
}

async function fetchAdminContent<T>(init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/content", {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    logDeveloperError("[admin content] request failed", payload.error);
    throw new Error(getFriendlyErrorMessage(payload.error, "Unable to load learning content."));
  }

  return payload;
}

export const AdminContentService = {
  async getContentStudioData() {
    return fetchAdminContent<AdminContentStudioData>();
  },

  async mutate(action: AdminContentAction, payload: Record<string, unknown>) {
    const response = await fetchAdminContent<{
      data: AdminContentStudioData;
      ok: boolean;
    }>({
      body: JSON.stringify({ action, payload }),
      method: "POST",
    });

    return response.data;
  },

  async generateCurriculumDraft(payload: CurriculumDraftRequest) {
    const token = await getAccessToken();
    const response = await fetch("/api/admin/content/curriculum-drafts", {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = (await response.json()) as CurriculumDraftResponse & {
      error?: { message?: string } | string;
    };

    if (!response.ok) {
      const message =
        typeof result.error === "string"
          ? result.error
          : result.error?.message ?? "Unable to generate curriculum drafts.";
      throw new Error(getFriendlyErrorMessage(message, "Unable to generate curriculum drafts."));
    }

    return result;
  },
};
