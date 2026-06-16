import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ConceptMasteryStatus, DecaEvent } from "@/lib/types";

export function eventPath(event: Pick<DecaEvent, "code">) {
  return `/learn/${event.code.toLowerCase()}`;
}

export function eventTypeLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function masteryLabel(status?: ConceptMasteryStatus | null) {
  if (!status || status === "not_started") {
    return "Not started";
  }

  return status.replace(/_/g, " ");
}

export function masteryTone(status?: ConceptMasteryStatus | null): "amber" | "blue" | "green" | "slate" {
  if (status === "almost_mastered" || status === "mastered") {
    return "green";
  }

  if (status === "practicing") {
    return "blue";
  }

  if (status === "learning") {
    return "amber";
  }

  return "slate";
}

export function EventMeta({ event }: { event: DecaEvent }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone="blue">{event.code}</Badge>
      {event.cluster ? <Badge>{event.cluster}</Badge> : null}
      <Badge>{eventTypeLabel(event.event_type)}</Badge>
      {event.participants ? <Badge>{event.participants} participant{event.participants === 1 ? "" : "s"}</Badge> : null}
      {event.exam_cluster ? <Badge>{event.exam_cluster} exam cluster</Badge> : null}
    </div>
  );
}

export function LearningEmptyCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Card className="border-dashed bg-slate-50">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </Card>
  );
}
