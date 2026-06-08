import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { StructuredQuestion } from "@/lib/types";

const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";

export const QuestionsService = {
  async getApprovedQuestionsForConcept(conceptId: string): Promise<StructuredQuestion[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("questions")
      .select(questionColumns)
      .eq("concept_id", conceptId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });

    if (error) {
      logDeveloperError("[questions] approved concept questions failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load questions."));
    }

    return data ?? [];
  },
};
