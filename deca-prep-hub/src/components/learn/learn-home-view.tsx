"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { eventPath, EventMeta } from "@/components/learn/learning-ui";
import { LearningService, type LearningEventSummary } from "@/lib/services/learning";

export function LearnHomeView() {
  const [events, setEvents] = useState<LearningEventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      setEvents(await LearningService.getLearningEvents());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load learning pathways.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  return (
    <>
      <PageHeader
        description="Guided learning is starting with MCS, but the system is designed to support additional DECA events and clusters as more key sets and questions are added."
        eyebrow="Learn"
        title="Guided Learning"
      />

      {error ? <ResourceErrorState message={error} onRetry={load} title="Unable to load learning" /> : null}

      <Card className="border-blue-100 bg-blue-50">
        <p className="text-sm leading-6 text-blue-900">
          Guided learning is currently piloting with MCS. The resource library still supports all DECA events.
          Future pathways can be added by enabling an event and adding approved key sets, concepts, and questions.
        </p>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {events.map(({ approvedQuestionCount, event, keySetCount }) => {
          const isRecommended = event.code === "MCS";
          const isComingSoon = approvedQuestionCount === 0;

          return (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100"
              href={eventPath(event)}
              key={event.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    {isRecommended ? <Badge tone="green">Recommended first pathway</Badge> : null}
                    {isComingSoon ? <Badge tone="amber">Coming soon</Badge> : <Badge tone="blue">Active pilot</Badge>}
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-slate-950">{event.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p>
                </div>
              </div>
              <div className="mt-4">
                <EventMeta event={event} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                {keySetCount} key set{keySetCount === 1 ? "" : "s"} · {approvedQuestionCount} approved question{approvedQuestionCount === 1 ? "" : "s"}
              </p>
            </Link>
          );
        })}
      </section>

      {events.length === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold text-slate-950">No guided pathways yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Learning pathways appear after an event is marked as a pilot or has approved learning content.
          </p>
        </Card>
      ) : null}

      <div>
        <ButtonLink href="/resources">Open resource library</ButtonLink>
      </div>
    </>
  );
}
