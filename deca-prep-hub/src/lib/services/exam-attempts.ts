import { getSupabaseClient } from "@/lib/supabase/client";
import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import type {
  ExamAttempt,
  ExamAttemptResult,
  ExamCorrectAnswer,
  PublicExamResource,
} from "@/lib/types";

export type ExamTakingQuestion = {
  question_number: number;
  instructional_area: string | null;
};

export type ExamForTaking = {
  resource: PublicExamResource;
  hasAnswerKey: boolean;
  questionCount: number;
  questions: ExamTakingQuestion[];
};

export type ExamSubmitAnswer = {
  question_number: number;
  selected_answer: ExamCorrectAnswer;
};

export const EXAM_ATTEMPTS_CHANGED_EVENT = "exam-attempts:changed";

function notifyExamAttemptsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EXAM_ATTEMPTS_CHANGED_EVENT));
  }
}

async function getAccessToken() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    logDeveloperError("[exam attempts] session lookup failed", error);
    throw new Error(getFriendlyErrorMessage(error, "Unable to verify your session."));
  }

  if (!data.session?.access_token) {
    throw new Error("You must be signed in to take exams.");
  }

  return data.session.access_token;
}

async function fetchExamEndpoint<T>(path: string, options: RequestInit = {}) {
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
    logDeveloperError(`[exam attempts] ${path} failed`, payload.error);
    throw new Error(getFriendlyErrorMessage(payload.error, "Unable to complete the exam request."));
  }

  return payload;
}

export const ExamAttemptsService = {
  async getExamForTaking(resourceId: string): Promise<ExamForTaking> {
    return fetchExamEndpoint<ExamForTaking>(`/api/exams/${resourceId}/take`);
  },

  async submitExamAttempt(resourceId: string, answers: ExamSubmitAnswer[]) {
    const result = await fetchExamEndpoint<{ attemptId: string }>(`/api/exams/${resourceId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    notifyExamAttemptsChanged();
    return result;
  },

  async getExamAttemptResult(attemptId: string): Promise<ExamAttemptResult> {
    return fetchExamEndpoint<ExamAttemptResult>(`/api/exams/attempts/${attemptId}`);
  },

  async deleteExamAttempt(attemptId: string): Promise<void> {
    await fetchExamEndpoint<{ deleted: boolean }>(`/api/exams/attempts/${attemptId}`, {
      method: "DELETE",
    });
    notifyExamAttemptsChanged();
  },

  async getStudentExamAttemptsForResource(resourceId: string): Promise<ExamAttempt[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("exam_attempts")
      .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
      .eq("resource_id", resourceId)
      .order("completed_at", { ascending: false })
      .limit(5);

    if (error) {
      logDeveloperError("[exam attempts] resource attempts failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load recent exam attempts."));
    }

    return data ?? [];
  },
};
