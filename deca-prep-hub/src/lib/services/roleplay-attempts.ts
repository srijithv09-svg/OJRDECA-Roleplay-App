import { getSupabaseClient } from "@/lib/supabase/client";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import type {
  RoleplayAttempt,
  RoleplayAttemptInput,
  RoleplayAttemptResult,
  RoleplayAttemptSummary,
} from "@/lib/types";

export const ROLEPLAY_ATTEMPTS_CHANGED_EVENT = "roleplay-attempts:changed";

function notifyRoleplayAttemptsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ROLEPLAY_ATTEMPTS_CHANGED_EVENT));
  }
}

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    logDeveloperError("[roleplay attempts] session lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to verify your session."));
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in to practice roleplays.");
  }

  return data.session.access_token;
}

async function fetchRoleplayEndpoint<T>(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    logDeveloperError(`[roleplay attempts] ${path} failed`, payload.error);
    throw new Error(
      getFriendlyErrorMessage(payload.error, "Unable to complete the roleplay request."),
    );
  }

  return payload;
}

export const RoleplayAttemptsService = {
  async createRoleplayAttempt(resourceId: string, input: RoleplayAttemptInput) {
    const result = await fetchRoleplayEndpoint<{ attemptId: string }>(
      `/api/roleplays/${resourceId}/attempts`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    notifyRoleplayAttemptsChanged();
    return result;
  },

  async updateRoleplayAttempt(attemptId: string, input: RoleplayAttemptInput) {
    const result = await fetchRoleplayEndpoint<{ attempt: RoleplayAttempt }>(
      `/api/roleplays/attempts/${attemptId}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
    notifyRoleplayAttemptsChanged();
    return result;
  },

  async getRoleplayAttemptResult(attemptId: string): Promise<RoleplayAttemptResult> {
    return fetchRoleplayEndpoint<RoleplayAttemptResult>(`/api/roleplays/attempts/${attemptId}`);
  },

  async deleteRoleplayAttempt(attemptId: string): Promise<void> {
    await fetchRoleplayEndpoint<{ deleted: boolean }>(`/api/roleplays/attempts/${attemptId}`, {
      method: "DELETE",
    });
    notifyRoleplayAttemptsChanged();
  },

  async uploadRoleplayAttemptAudio(attemptId: string, audio: Blob): Promise<{ audioPath: string }> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("audio", audio, "roleplay-practice.webm");

    const response = await fetch(`/api/roleplays/attempts/${attemptId}/audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const payload = (await response.json()) as { audioPath?: string; error?: string };

    if (!response.ok || !payload.audioPath) {
      logDeveloperError(`[roleplay attempts] audio upload failed`, payload.error);
      throw new Error(getFriendlyErrorMessage(payload.error, "Unable to upload roleplay audio."));
    }

    notifyRoleplayAttemptsChanged();
    return { audioPath: payload.audioPath };
  },

  async getRoleplayAttemptAudioSignedUrl(attemptId: string): Promise<string | null> {
    const result = await fetchRoleplayEndpoint<{ signedUrl: string | null }>(
      `/api/roleplays/attempts/${attemptId}/audio`,
    );

    return result.signedUrl;
  },

  async removeRoleplayAttemptAudio(attemptId: string): Promise<void> {
    await fetchRoleplayEndpoint<{ removed: boolean }>(
      `/api/roleplays/attempts/${attemptId}/audio`,
      {
        method: "DELETE",
      },
    );
    notifyRoleplayAttemptsChanged();
  },

  async getStudentRoleplayAttemptsForResource(
    resourceId: string,
  ): Promise<RoleplayAttemptSummary[]> {
    return fetchRoleplayEndpoint<RoleplayAttemptSummary[]>(
      `/api/roleplays/${resourceId}/attempts`,
    );
  },
};
