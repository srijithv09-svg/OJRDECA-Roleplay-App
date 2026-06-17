import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Concept,
  DecaEvent,
  KeySet,
  KeySetConcept,
  StructuredQuestion,
  StudyResource,
} from "@/lib/types";

export type AdminContentStudioData = {
  concepts: Concept[];
  events: DecaEvent[];
  keySetConcepts: KeySetConcept[];
  keySets: KeySet[];
  questions: StructuredQuestion[];
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
};
