import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { ResourceListItem } from "@/lib/types";

export function SupabaseResourceCard({
  resource,
  actionLabel,
}: {
  resource: ResourceListItem;
  actionLabel: string;
}) {
  const isRoleplay = resource.resource_type === "roleplay";
  const hasReviewedIndicators =
    isRoleplay && resource.performance_indicators_reviewed && resource.performance_indicators?.length;
  const typeLabel =
    resource.resource_type === "roleplay"
      ? "Roleplay"
      : resource.resource_type === "exam"
        ? "Exam"
        : resource.resource_type === "reference"
          ? "Reference"
          : "Unknown";

  return (
    <Link
      className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-blue-200 hover:shadow-md hover:shadow-blue-100"
      href={`/resources/${resource.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{resource.cluster ?? "Unassigned cluster"}</Badge>
        {resource.event_code ? <Badge>{resource.event_code}</Badge> : null}
        <Badge>{resource.year ?? "Year TBD"}</Badge>
        <Badge tone={resource.approval_status === "pending" ? "amber" : "green"}>
          {resource.approval_status ?? "No status"}
        </Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{resource.title}</h2>
      <p className="mt-1 text-sm font-medium text-slate-500">
        {resource.event_name ?? resource.event_category ?? "Event not assigned"}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        {isRoleplay ? (
          <>
            <div>
              <dt className="font-semibold text-slate-800">Event category</dt>
              <dd className="mt-1 text-slate-600">
                {resource.event_category ?? "Not tagged yet"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">Event name</dt>
              <dd className="mt-1 text-slate-600">{resource.event_name ?? "Not assigned"}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="font-semibold text-slate-800">Cluster</dt>
          <dd className="mt-1 text-slate-600">{resource.cluster ?? "Not assigned"}</dd>
        </div>
        {isRoleplay ? (
          <div>
            <dt className="font-semibold text-slate-800">Performance indicators</dt>
            <dd className="mt-1 text-slate-600">
              {hasReviewedIndicators
                ? resource.performance_indicators?.join("; ")
                : "Performance indicators pending review"}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500">
          {typeLabel} resource
        </span>
        <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          {actionLabel}
          <Icon className="h-4 w-4" name="chevronRight" />
        </span>
      </div>
    </Link>
  );
}
