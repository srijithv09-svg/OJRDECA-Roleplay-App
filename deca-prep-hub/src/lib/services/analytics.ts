import { getSupabaseClient } from "@/lib/supabase/client";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import type { AdminAnalyticsSummary, StudentAnalyticsSummary } from "@/lib/types";

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    logDeveloperError("[analytics] session lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to verify your session."));
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in to load analytics.");
  }

  return data.session.access_token;
}

async function fetchAnalyticsEndpoint<T>(path: string) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    logDeveloperError(`[analytics] ${path} failed`, payload.error);
    throw new Error(getFriendlyErrorMessage(payload.error, "Unable to load analytics."));
  }

  return payload;
}

export const AnalyticsService = {
  async getStudentAnalytics(): Promise<StudentAnalyticsSummary> {
    return fetchAnalyticsEndpoint<StudentAnalyticsSummary>("/api/analytics/student");
  },

  async getAdminAnalytics(): Promise<AdminAnalyticsSummary> {
    return fetchAnalyticsEndpoint<AdminAnalyticsSummary>("/api/analytics/admin");
  },
};
