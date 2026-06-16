"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { LearningEmptyCard, eventPath, masteryLabel, masteryTone } from "@/components/learn/learning-ui";
import { LearningService, type KeySetConceptSummary } from "@/lib/services/learning";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DecaEvent, KeySet } from "@/lib/types";

export function LearnKeySetView({
  eventCode,
  keySetId,
}: {
  eventCode: string;
  keySetId: string;
}) {
  const [concepts, setConcepts] = useState<KeySetConceptSummary[]>([]);
  const [event, setEvent] = useState<DecaEvent | null>(null);
  const [keySet, setKeySet] = useState<KeySet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const [{ data: sessionData }, nextEvent, nextKeySet] = await Promise.all([
        supabase.auth.getSession(),
        LearningService.getLearningEventByCode(eventCode),
        LearningService.getKeySet(keySetId),
      ]);
      const userId = sessionData.session?.user.id;

      setEvent(nextEvent);
      setKeySet(nextKeySet);

      if (nextEvent?.is_pilot && nextKeySet?.event_id === nextEvent.id) {
        setConcepts(await LearningService.getConceptsForKeySet(keySetId, userId));
      } else {
        setConcepts([]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load this key set.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCode, keySetId]);

  const nextConcept = useMemo(
    () =>
      concepts.find((item) => !item.mastery || item.mastery.status !== "almost_mastered" && item.mastery.status !== "mastered") ??
      concepts[0],
    [concepts],
  );

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={load} title="Unable to load key set" />;
  }

  if (!event || !event.is_pilot || !keySet || keySet.event_id !== event.id) {
    return (
      <LearningEmptyCard title="This key set is not available.">
        <p>This event does not have an approved guided learning key set at this address.</p>
        <ButtonLink className="mt-4" href="/learn">Back to Learn</ButtonLink>
      </LearningEmptyCard>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href={eventPath(event)}>Back to {event.code}</ButtonLink>
            {nextConcept ? (
              <ButtonLink href={`${eventPath(event)}/concepts/${nextConcept.concept.id}`} variant="primary">
                Next concept
              </ButtonLink>
            ) : null}
          </>
        }
        description={keySet.description ?? "Work through approved concepts and practice checks."}
        eyebrow={`${event.code} key set`}
        title={keySet.title}
      />

      {concepts.length === 0 ? (
        <LearningEmptyCard title="No approved concepts yet">
          <p>This key set is being prepared.</p>
        </LearningEmptyCard>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {concepts.map(({ concept, mastery }) => (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100"
              href={`${eventPath(event)}/concepts/${concept.id}`}
              key={concept.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">{concept.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {concept.student_friendly_definition ?? "Approved concept practice."}
                  </p>
                </div>
                <Badge tone={masteryTone(mastery?.status)}>{masteryLabel(mastery?.status)}</Badge>
              </div>
              {concept.example ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {concept.example}
                </p>
              ) : null}
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
