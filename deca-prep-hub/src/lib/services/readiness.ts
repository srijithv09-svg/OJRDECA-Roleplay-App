import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AdminReadinessSummary, StudentReadinessSummary } from "@/lib/types";

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    logDeveloperError("[readiness] session lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to verify your session."));
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in to load readiness data.");
  }

  return data.session.access_token;
}

async function fetchReadinessEndpoint<T>(path: string) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    logDeveloperError(`[readiness] ${path} failed`, payload.error);
    throw new Error(getFriendlyErrorMessage(payload.error, "Unable to load readiness data."));
  }

  return payload;
}

export const ReadinessService = {
  async getStudentReadinessSummary(): Promise<StudentReadinessSummary> {
    return fetchReadinessEndpoint<StudentReadinessSummary>("/api/readiness/student");
  },

  async getAdminReadinessSummary(): Promise<AdminReadinessSummary> {
    return fetchReadinessEndpoint<AdminReadinessSummary>("/api/readiness/admin");
  },
};
