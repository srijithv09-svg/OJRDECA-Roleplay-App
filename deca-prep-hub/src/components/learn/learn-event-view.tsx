"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { EventMeta, LearningEmptyCard, StudyResourceList, eventPath } from "@/components/learn/learning-ui";
import { LearningService } from "@/lib/services/learning";
import type { DecaEvent, KeySet, StudyResource } from "@/lib/types";

export function LearnEventView({ eventCode }: { eventCode: string }) {
  const [event, setEvent] = useState<DecaEvent | null>(null);
  const [keySets, setKeySets] = useState<KeySet[]>([]);
  const [studyResources, setStudyResources] = useState<StudyResource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const nextEvent = await LearningService.getLearningEventByCode(eventCode);
      setEvent(nextEvent);

      if (nextEvent?.is_pilot) {
        const [nextKeySets, nextResources] = await Promise.all([
          LearningService.getApprovedKeySetsForEvent(nextEvent.id),
          LearningService.getApprovedStudyResources({ eventId: nextEvent.id }),
        ]);
        setKeySets(nextKeySets);
        setStudyResources(nextResources);
      } else {
        setKeySets([]);
        setStudyResources([]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load this pathway.");
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
  }, [eventCode]);

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={load} title="Unable to load pathway" />;
  }

  if (!event) {
    return (
      <LearningEmptyCard title="Pathway not found">
        <p>This learning pathway could not be found.</p>
        <ButtonLink className="mt-4" href="/learn">Back to Learn</ButtonLink>
      </LearningEmptyCard>
    );
  }

  if (!event.is_pilot) {
    return (
      <LearningEmptyCard title="This event does not have a guided learning pathway yet.">
        <p>
          The canonical event catalog can support this event for resources, but guided learning content has not been enabled.
        </p>
        <ButtonLink className="mt-4" href="/learn">Back to Learn</ButtonLink>
      </LearningEmptyCard>
    );
  }

  return (
    <>
      <PageHeader
        actions={<ButtonLink href="/learn">Back to Learn</ButtonLink>}
        description={event.description ?? "Build concept confidence through guided DECA practice."}
        eyebrow="Learning pathway"
        title={`${event.code}: ${event.name}`}
      />

      <Card>
        <EventMeta event={event} />
      </Card>

      <StudyResourceList resources={studyResources} />

      {keySets.length === 0 ? (
        <LearningEmptyCard title="This pathway is being prepared.">
          <p>No approved key sets are available yet.</p>
        </LearningEmptyCard>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {keySets.map((keySet) => (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100"
              href={`${eventPath(event)}/key-sets/${keySet.id}`}
              key={keySet.id}
            >
              <Badge tone="blue">Key set</Badge>
              <h2 className="mt-4 text-xl font-bold text-slate-950">{keySet.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {keySet.description ?? "Approved concept practice for this pathway."}
              </p>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
