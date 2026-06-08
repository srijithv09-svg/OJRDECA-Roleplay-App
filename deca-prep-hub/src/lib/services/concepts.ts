import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Concept } from "@/lib/types";

const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,created_at,updated_at";

export const ConceptsService = {
  async getApprovedConceptsForKeySet(keySetId: string): Promise<Concept[]> {
    const supabase = getSupabaseClient();
    const { data: links, error: linkError } = await supabase
      .from("key_set_concepts")
      .select("concept_id,sort_order")
      .eq("key_set_id", keySetId)
      .order("sort_order", { ascending: true });

    if (linkError) {
      logDeveloperError("[concepts] key set concept links failed", linkError);
      throw new Error(getFriendlyErrorMessage(linkError, "Unable to load key set concepts."));
    }

    const conceptIds = (links ?? []).map((link) => link.concept_id);

    if (conceptIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("concepts")
      .select(conceptColumns)
      .in("id", conceptIds)
      .eq("status", "approved");

    if (error) {
      logDeveloperError("[concepts] approved concepts failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load concepts."));
    }

    const conceptsById = new Map((data ?? []).map((concept) => [concept.id, concept]));

    return conceptIds
      .map((conceptId) => conceptsById.get(conceptId))
      .filter((concept): concept is Concept => Boolean(concept));
  },
};
