import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ConceptMastery, ConceptMasteryInput } from "@/lib/types";

const conceptMasteryColumns =
  "user_id,concept_id,status,recognize_score,define_score,connect_score,apply_score,explain_score,improve_score,last_practiced_at,created_at,updated_at";

export const ConceptMasteryService = {
  async getUserConceptMastery(
    userId: string,
    conceptId: string,
  ): Promise<ConceptMastery | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("concept_mastery")
      .select(conceptMasteryColumns)
      .eq("user_id", userId)
      .eq("concept_id", conceptId)
      .maybeSingle();

    if (error) {
      logDeveloperError("[concept mastery] lookup failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load concept mastery."));
    }

    return data;
  },

  async upsertUserConceptMastery(
    userId: string,
    conceptId: string,
    mastery: ConceptMasteryInput,
  ): Promise<ConceptMastery> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("concept_mastery")
      .upsert(
        {
          user_id: userId,
          concept_id: conceptId,
          ...mastery,
        },
        { onConflict: "user_id,concept_id" },
      )
      .select(conceptMasteryColumns)
      .single();

    if (error) {
      logDeveloperError("[concept mastery] upsert failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to save concept mastery."));
    }

    return data;
  },
};
