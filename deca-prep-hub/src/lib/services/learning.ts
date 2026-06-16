import { getFriendlyErrorMessage, logDeveloperError } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Concept,
  ConceptMastery,
  DecaEvent,
  KeySet,
  KeySetConcept,
  QuestionAttempt,
  StructuredQuestion,
} from "@/lib/types";

const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";
const keySetColumns = "id,event_id,title,description,sort_order,status,created_at,updated_at";
const conceptColumns =
  "id,name,slug,cluster,instructional_area,student_friendly_definition,detailed_explanation,example,common_misconceptions,status,created_at,updated_at";
const questionColumns =
  "id,source_resource_id,event_id,concept_id,question_type,ladder_stage,prompt,choices,correct_answer,explanation,difficulty,status,ai_generated,ai_extracted,admin_reviewed,created_at,updated_at";
const masteryColumns =
  "user_id,concept_id,status,recognize_score,define_score,connect_score,apply_score,explain_score,improve_score,last_practiced_at,created_at,updated_at";
const attemptColumns =
  "id,user_id,question_id,answer,is_correct,feedback,attempt_number,created_at";

export type LearningEventSummary = {
  approvedQuestionCount: number;
  event: DecaEvent;
  keySetCount: number;
};

export type KeySetConceptSummary = {
  concept: Concept;
  mastery: ConceptMastery | null;
  sort_order: number;
};

export type ConceptLearningData = {
  attempts: QuestionAttempt[];
  concept: Concept;
  event: DecaEvent;
  mastery: ConceptMastery | null;
  questions: StructuredQuestion[];
};

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export const LearningService = {
  async getLearningEvents(): Promise<LearningEventSummary[]> {
    const supabase = getSupabaseClient();
    const [{ data: pilotEvents, error: pilotError }, { data: keySets, error: keySetError }] =
      await Promise.all([
        supabase
          .from("events")
          .select(eventColumns)
          .eq("is_pilot", true)
          .order("sort_order", { ascending: true })
          .order("code", { ascending: true }),
        supabase.from("key_sets").select(keySetColumns).eq("status", "approved"),
      ]);

    if (pilotError || keySetError) {
      logDeveloperError("[learning] learning events failed", pilotError ?? keySetError);
      throw new Error(getFriendlyErrorMessage(pilotError ?? keySetError, "Unable to load learning pathways."));
    }

    const approvedEventIds = uniqueValues((keySets ?? []).map((keySet) => keySet.event_id));
    let configuredEvents = pilotEvents ?? [];

    if (approvedEventIds.length > 0) {
      const missingIds = approvedEventIds.filter(
        (eventId) => !configuredEvents.some((event) => event.id === eventId),
      );

      if (missingIds.length > 0) {
        const { data: eventsWithContent, error } = await supabase
          .from("events")
          .select(eventColumns)
          .in("id", missingIds);

        if (error) {
          logDeveloperError("[learning] content event lookup failed", error);
          throw new Error(getFriendlyErrorMessage(error, "Unable to load learning pathways."));
        }

        configuredEvents = [...configuredEvents, ...(eventsWithContent ?? [])];
      }
    }

    const questionCounts = await Promise.all(
      configuredEvents.map(async (event) => {
        const { count, error } = await supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("status", "approved");

        if (error) {
          logDeveloperError("[learning] approved question count failed", error);
        }

        return [event.id, count ?? 0] as const;
      }),
    );
    const questionCountByEventId = new Map(questionCounts);
    const keySetCountByEventId = new Map<string, number>();

    for (const keySet of keySets ?? []) {
      keySetCountByEventId.set(keySet.event_id, (keySetCountByEventId.get(keySet.event_id) ?? 0) + 1);
    }

    return configuredEvents
      .map((event) => ({
        approvedQuestionCount: questionCountByEventId.get(event.id) ?? 0,
        event,
        keySetCount: keySetCountByEventId.get(event.id) ?? 0,
      }))
      .sort((first, second) => first.event.sort_order - second.event.sort_order || first.event.code.localeCompare(second.event.code));
  },

  async getLearningEventByCode(eventCode: string): Promise<DecaEvent | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("events")
      .select(eventColumns)
      .eq("code", eventCode.trim().toUpperCase())
      .maybeSingle();

    if (error) {
      logDeveloperError("[learning] event by code failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load this pathway."));
    }

    return data;
  },

  async getApprovedKeySetsForEvent(eventId: string): Promise<KeySet[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("key_sets")
      .select(keySetColumns)
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      logDeveloperError("[learning] key sets failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load key sets."));
    }

    return data ?? [];
  },

  async getKeySet(keySetId: string): Promise<KeySet | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("key_sets")
      .select(keySetColumns)
      .eq("id", keySetId)
      .eq("status", "approved")
      .maybeSingle();

    if (error) {
      logDeveloperError("[learning] key set failed", error);
      throw new Error(getFriendlyErrorMessage(error, "Unable to load this key set."));
    }

    return data;
  },

  async getConceptsForKeySet(keySetId: string, userId?: string): Promise<KeySetConceptSummary[]> {
    const supabase = getSupabaseClient();
    const { data: links, error: linkError } = await supabase
      .from("key_set_concepts")
      .select("key_set_id,concept_id,sort_order")
      .eq("key_set_id", keySetId)
      .order("sort_order", { ascending: true });

    if (linkError) {
      logDeveloperError("[learning] key set concepts failed", linkError);
      throw new Error(getFriendlyErrorMessage(linkError, "Unable to load concepts."));
    }

    const typedLinks = (links ?? []) as KeySetConcept[];
    const conceptIds = typedLinks.map((link) => link.concept_id);

    if (conceptIds.length === 0) {
      return [];
    }

    const [{ data: concepts, error: conceptError }, masteryResult] = await Promise.all([
      supabase.from("concepts").select(conceptColumns).in("id", conceptIds).eq("status", "approved"),
      userId
        ? supabase.from("concept_mastery").select(masteryColumns).eq("user_id", userId).in("concept_id", conceptIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (conceptError || masteryResult.error) {
      logDeveloperError("[learning] concepts/mastery failed", conceptError ?? masteryResult.error);
      throw new Error(getFriendlyErrorMessage(conceptError ?? masteryResult.error, "Unable to load concepts."));
    }

    const conceptsById = new Map((concepts ?? []).map((concept) => [concept.id, concept]));
    const masteryByConceptId = new Map(
      ((masteryResult.data ?? []) as ConceptMastery[]).map((mastery) => [mastery.concept_id, mastery]),
    );

    return typedLinks
      .map((link) => {
        const concept = conceptsById.get(link.concept_id);
        return concept
          ? {
              concept,
              mastery: masteryByConceptId.get(link.concept_id) ?? null,
              sort_order: link.sort_order,
            }
          : null;
      })
      .filter((summary): summary is KeySetConceptSummary => Boolean(summary));
  },

  async getConceptLearningData(
    conceptId: string,
    eventId: string,
    userId?: string,
  ): Promise<ConceptLearningData | null> {
    const supabase = getSupabaseClient();
    const [{ data: concept, error: conceptError }, { data: event, error: eventError }, { data: questions, error: questionError }] =
      await Promise.all([
        supabase.from("concepts").select(conceptColumns).eq("id", conceptId).eq("status", "approved").maybeSingle(),
        supabase.from("events").select(eventColumns).eq("id", eventId).maybeSingle(),
        supabase
          .from("questions")
          .select(questionColumns)
          .eq("concept_id", conceptId)
          .eq("event_id", eventId)
          .eq("status", "approved")
          .order("created_at", { ascending: true }),
      ]);

    if (conceptError || eventError || questionError) {
      logDeveloperError("[learning] concept data failed", conceptError ?? eventError ?? questionError);
      throw new Error(getFriendlyErrorMessage(conceptError ?? eventError ?? questionError, "Unable to load this concept."));
    }

    if (!concept || !event) {
      return null;
    }

    const questionIds = (questions ?? []).map((question) => question.id);
    const [{ data: mastery }, { data: attempts }] = await Promise.all([
      userId
        ? supabase
            .from("concept_mastery")
            .select(masteryColumns)
            .eq("user_id", userId)
            .eq("concept_id", conceptId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      userId && questionIds.length > 0
        ? supabase
            .from("question_attempts")
            .select(attemptColumns)
            .eq("user_id", userId)
            .in("question_id", questionIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    return {
      attempts: (attempts ?? []) as QuestionAttempt[],
      concept,
      event,
      mastery: mastery ?? null,
      questions: questions ?? [],
    };
  },
};
