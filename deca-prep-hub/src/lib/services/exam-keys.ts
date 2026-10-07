import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getExamKeyStatus } from "@/lib/exams/answer-key-status";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ExamAnswerKeyInput,
  ExamAnswerKeyRow,
  ExamResourceWithKeyStatus,
} from "@/lib/types";

const examResourceColumns =
  "id,title,cluster,event_code,event_name,event_category,instructional_area,year,resource_type,approval_status,original_filename,confidence_score,import_notes,file_path,storage_path";

const answerKeyColumns =
  "id,resource_id,question_number,correct_answer,instructional_area,created_at,updated_at";

function normalizeAnswerKeyRow(row: ExamAnswerKeyRow): ExamAnswerKeyRow {
  return {
    ...row,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export const ExamKeysService = {
  async getApprovedExamResourcesWithKeyStatus(): Promise<ExamResourceWithKeyStatus[]> {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    const examRows = [];

    for (let offset = 0; ; offset += pageSize) {
      const { data: exams, error: examsError } = await supabase
        .from("resources")
        .select(examResourceColumns)
        .eq("approval_status", "approved")
        .eq("resource_type", "exam")
        .order("year", { ascending: false })
        .order("title", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (examsError) {
        logDeveloperError("[exam keys] approved exam resources failed", examsError);
        throw new Error(getFriendlyErrorMessage(examsError, "Unable to load approved exams."));
      }

      examRows.push(...(exams ?? []));
      if ((exams?.length ?? 0) < pageSize) break;
    }

    if (examRows.length === 0) {
      return [];
    }

    const resourceIds = examRows.map((exam) => exam.id);
    const questionsByResourceId = new Map<string, number[]>();

    // Paginate keys too: ten complete exams already fill the Data API's default row limit.
    // Small ID batches also keep the filter URL bounded for large libraries.
    for (let start = 0; start < resourceIds.length; start += 100) {
      for (let offset = 0; ; offset += pageSize) {
        const { data: answerKeyRows, error: answerKeyError } = await supabase
          .from("exam_answer_keys")
          .select("resource_id,question_number")
          .in("resource_id", resourceIds.slice(start, start + 100))
          .order("resource_id", { ascending: true })
          .order("question_number", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (answerKeyError) {
          logDeveloperError("[exam keys] answer key counts failed", answerKeyError);
          throw new Error(getFriendlyErrorMessage(answerKeyError, "Unable to load answer key status."));
        }

        for (const row of answerKeyRows ?? []) {
          const questions = questionsByResourceId.get(row.resource_id) ?? [];
          questions.push(row.question_number);
          questionsByResourceId.set(row.resource_id, questions);
        }

        if ((answerKeyRows?.length ?? 0) < pageSize) break;
      }
    }

    return examRows.map((exam) => {
      const questionNumbers = questionsByResourceId.get(exam.id) ?? [];

      return {
        ...exam,
        answer_key_count: questionNumbers.length,
        answer_key_status: getExamKeyStatus(questionNumbers),
      };
    });
  },

  async extractExamAnswerKey(resourceId: string): Promise<ExamAnswerKeyInput[]> {
    const { data, error } = await getSupabaseClient().auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Your session has expired. Sign in again to read this key.");
    }

    const response = await fetch(`/api/admin/exam-keys/${encodeURIComponent(resourceId)}/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const payload = await response.json().catch(() => null) as {
      error?: string;
      rows?: ExamAnswerKeyInput[];
    } | null;

    if (!response.ok || !payload?.rows) {
      throw new Error(payload?.error ?? "Unable to read the PDF answer key. Try again or paste the answers manually.");
    }

    return payload.rows;
  },

  async getExamAnswerKey(resourceId: string): Promise<ExamAnswerKeyRow[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("exam_answer_keys")
      .select(answerKeyColumns)
      .eq("resource_id", resourceId)
      .order("question_number", { ascending: true });

    if (error) {
      logDeveloperError("[exam keys] answer key lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load this answer key."));
    }

    return (data ?? []).map((row) => normalizeAnswerKeyRow(row));
  },

  async upsertExamAnswerKey(
    resourceId: string,
    rows: ExamAnswerKeyInput[],
  ): Promise<ExamAnswerKeyRow[]> {
    if (rows.length === 0) {
      return [];
    }

    const supabase = getSupabaseClient();
    const payload = rows.map((row) => ({
      resource_id: resourceId,
      question_number: row.question_number,
      correct_answer: row.correct_answer,
      instructional_area: row.instructional_area?.trim() || null,
    }));

    const { data, error } = await supabase
      .from("exam_answer_keys")
      .upsert(payload, {
        onConflict: "resource_id,question_number",
      })
      .select(answerKeyColumns)
      .order("question_number", { ascending: true });

    if (error) {
      logDeveloperError("[exam keys] answer key upsert failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to save this answer key."));
    }

    return (data ?? []).map((row) => normalizeAnswerKeyRow(row));
  },

  async deleteExamAnswerKeyRows(resourceId: string, questionNumbers: number[]): Promise<void> {
    if (questionNumbers.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("exam_answer_keys")
      .delete()
      .eq("resource_id", resourceId)
      .in("question_number", questionNumbers);

    if (error) {
      logDeveloperError("[exam keys] answer key delete failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to delete answer key rows."));
    }
  },

  getExamKeyStatus,
};
