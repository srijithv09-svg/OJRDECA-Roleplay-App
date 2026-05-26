import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ExamAnswerKeyInput,
  ExamAnswerKeyRow,
  ExamKeyStatus,
  ExamResourceWithKeyStatus,
} from "@/lib/types";

const examResourceColumns =
  "id,title,cluster,event_name,instructional_area,year,resource_type,approval_status,original_filename,performance_indicators,performance_indicators_reviewed,confidence_score,import_notes,file_path,storage_path";

const answerKeyColumns =
  "id,resource_id,question_number,correct_answer,instructional_area,created_at,updated_at";

function getExamKeyStatus(answerKeyCount: number): ExamKeyStatus {
  if (answerKeyCount === 0) {
    return "no-key";
  }

  if (answerKeyCount >= 100) {
    return "complete";
  }

  return "partial";
}

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
    const { data: exams, error: examsError } = await supabase
      .from("resources")
      .select(examResourceColumns)
      .eq("approval_status", "approved")
      .eq("resource_type", "exam")
      .order("year", { ascending: false })
      .order("title", { ascending: true });

    console.log("[exam keys] approved exam query filters", {
      approval_status: "approved",
      resource_type: "exam",
    });
    console.log("[exam keys] approved exam query result", exams ?? null);
    console.log("[exam keys] approved exam query error", examsError ?? null);

    if (examsError) {
      throw new Error(examsError.message);
    }

    const examRows = exams ?? [];

    if (examRows.length === 0) {
      return [];
    }

    const resourceIds = examRows.map((exam) => exam.id);
    const { data: answerKeyRows, error: answerKeyError } = await supabase
      .from("exam_answer_keys")
      .select("resource_id,question_number")
      .in("resource_id", resourceIds);

    if (answerKeyError) {
      throw new Error(answerKeyError.message);
    }

    const countsByResourceId = new Map<string, number>();

    for (const row of answerKeyRows ?? []) {
      countsByResourceId.set(row.resource_id, (countsByResourceId.get(row.resource_id) ?? 0) + 1);
    }

    return examRows.map((exam) => {
      const answerKeyCount = countsByResourceId.get(exam.id) ?? 0;

      return {
        ...exam,
        answer_key_count: answerKeyCount,
        answer_key_status: getExamKeyStatus(answerKeyCount),
      };
    });
  },

  async getExamAnswerKey(resourceId: string): Promise<ExamAnswerKeyRow[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("exam_answer_keys")
      .select(answerKeyColumns)
      .eq("resource_id", resourceId)
      .order("question_number", { ascending: true });

    if (error) {
      throw new Error(error.message);
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
      throw new Error(error.message);
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
      throw new Error(error.message);
    }
  },

  getExamKeyStatus,
};
